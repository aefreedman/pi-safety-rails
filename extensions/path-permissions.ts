import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  firstMatchingPattern,
  loadDenyRules,
  normalizeInputPathCandidates,
} from "./shared/path-permissions";

const FILE_ACCESS_TOOLS = new Set(["read", "grep", "find", "ls"]);
const FILE_MUTATION_TOOLS = new Set(["write", "edit"]);

function getInputPaths(event: { toolName: string; input: Record<string, unknown> }, ctxCwd: string): string[] {
  const raw = typeof event.input.path === "string" ? event.input.path : undefined;
  return normalizeInputPathCandidates(ctxCwd, raw);
}

function firstMatchAcrossPaths(paths: string[], patterns: string[]): string | undefined {
  for (const candidate of paths) {
    const match = firstMatchingPattern(candidate, patterns);
    if (match) return match;
  }
  return undefined;
}

export default function pathPermissions(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!FILE_ACCESS_TOOLS.has(event.toolName) && !FILE_MUTATION_TOOLS.has(event.toolName)) {
      return;
    }

    const { rules } = loadDenyRules(ctx.cwd);
    const resolvedPaths = getInputPaths(event as { toolName: string; input: Record<string, unknown> }, ctx.cwd);
    const resolvedPath = resolvedPaths[0];

    const externalMatch = firstMatchAcrossPaths(resolvedPaths, rules.external_directory);
    const editMatch = firstMatchAcrossPaths(resolvedPaths, rules.edit);

    if (FILE_ACCESS_TOOLS.has(event.toolName) && externalMatch) {
      if (ctx.hasUI) {
        ctx.ui.notify(`Blocked ${event.toolName} on denied path: ${resolvedPath}`, "warning");
      }
      return {
        block: true,
        reason: `Path access denied for ${resolvedPath} by external_directory rule ${externalMatch}`,
      };
    }

    if (FILE_MUTATION_TOOLS.has(event.toolName)) {
      const matchedRule = editMatch ?? externalMatch;
      const matchedSection = editMatch ? "edit" : externalMatch ? "external_directory" : undefined;
      if (matchedRule && matchedSection) {
        if (ctx.hasUI) {
          ctx.ui.notify(`Blocked ${event.toolName} on denied path: ${resolvedPath}`, "warning");
        }
        return {
          block: true,
          reason: `Path mutation denied for ${resolvedPath} by ${matchedSection} rule ${matchedRule}`,
        };
      }
    }
  });
}
