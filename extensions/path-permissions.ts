import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  firstMatchingPattern,
  loadDenyRules,
  normalizeInputPath,
} from "./shared/path-permissions";

const FILE_ACCESS_TOOLS = new Set(["read", "grep", "find", "ls"]);
const FILE_MUTATION_TOOLS = new Set(["write", "edit"]);

function getInputPath(event: { toolName: string; input: Record<string, unknown> }, ctxCwd: string): string {
  const raw = typeof event.input.path === "string" ? event.input.path : undefined;
  return normalizeInputPath(ctxCwd, raw);
}

export default function pathPermissions(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!FILE_ACCESS_TOOLS.has(event.toolName) && !FILE_MUTATION_TOOLS.has(event.toolName)) {
      return;
    }

    const { rules } = loadDenyRules(ctx.cwd);
    const resolvedPath = getInputPath(event as { toolName: string; input: Record<string, unknown> }, ctx.cwd);

    const externalMatch = firstMatchingPattern(resolvedPath, rules.external_directory);
    const editMatch = firstMatchingPattern(resolvedPath, rules.edit);

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
