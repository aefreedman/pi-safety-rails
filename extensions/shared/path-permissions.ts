import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export {
  firstMatchingPattern,
  normalizeInputPath,
  normalizeInputPathCandidates,
  stripAtPrefix,
} from "./path-matching";
export type { PathMatchingPlatform } from "./path-matching";

export type PermissionDecision = "allow" | "deny";

export type PathPermissionsConfig = {
  permission?: {
    external_directory?: Record<string, PermissionDecision | string>;
    edit?: Record<string, PermissionDecision | string>;
  };
};

export type DenyRules = {
  external_directory: string[];
  edit: string[];
};

const warnedConfigErrors = new Set<string>();

function warnOnce(key: string, message: string) {
  if (warnedConfigErrors.has(key)) return;
  warnedConfigErrors.add(key);
  console.warn(`[pi-safety-rails:path-permissions] ${message}`);
}

function collectDeniedPatterns(source?: Record<string, PermissionDecision | string>): string[] {
  if (!source) return [];
  return Object.entries(source)
    .filter(([, decision]) => String(decision).toLowerCase() === "deny")
    .map(([pattern]) => pattern);
}

function readConfigFile(filePath: string): PathPermissionsConfig {
  if (!existsSync(filePath)) return {};

  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as PathPermissionsConfig;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnOnce(filePath, `Failed to parse ${filePath}: ${message}`);
    return {};
  }
}

export function loadDenyRules(cwd: string): { rules: DenyRules; sources: { globalPath: string; projectPath: string } } {
  const globalPath = path.join(getAgentDir(), "path-permissions.json");
  const projectPath = path.join(cwd, ".pi", "path-permissions.json");

  const globalConfig = readConfigFile(globalPath);
  const projectConfig = readConfigFile(projectPath);

  return {
    rules: {
      external_directory: [
        ...collectDeniedPatterns(globalConfig.permission?.external_directory),
        ...collectDeniedPatterns(projectConfig.permission?.external_directory),
      ],
      edit: [...collectDeniedPatterns(globalConfig.permission?.edit), ...collectDeniedPatterns(projectConfig.permission?.edit)],
    },
    sources: { globalPath, projectPath },
  };
}
