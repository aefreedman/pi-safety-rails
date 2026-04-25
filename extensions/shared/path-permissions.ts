import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";

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

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

function maybeLowercaseForPlatform(value: string): string {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

export function stripAtPrefix(value: string): string {
  return value.startsWith("@") ? value.slice(1) : value;
}

export function normalizeInputPath(ctxCwd: string, rawPath?: string): string {
  const candidate = rawPath && rawPath.trim() ? stripAtPrefix(rawPath.trim()) : ctxCwd;
  const expanded = expandHome(candidate);
  const absolute = path.isAbsolute(expanded) ? expanded : path.resolve(ctxCwd, expanded);
  return maybeLowercaseForPlatform(normalizeSlashes(path.normalize(absolute)));
}

function normalizePattern(pattern: string): string {
  const expanded = expandHome(pattern.trim());
  const normalized = normalizeSlashes(expanded);
  return maybeLowercaseForPlatform(normalized);
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizePattern(pattern);

  if (normalized.endsWith("/**")) {
    const base = escapeRegex(normalized.slice(0, -3));
    return new RegExp(`^${base}(?:/.*)?$`);
  }

  const withSentinels = normalized.replace(/\*\*/g, "__DOUBLE_STAR__");
  const escaped = escapeRegex(withSentinels)
    .replace(/__DOUBLE_STAR__/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");

  return new RegExp(`^${escaped}$`);
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

export function firstMatchingPattern(targetPath: string, patterns: string[]): string | undefined {
  for (const pattern of patterns) {
    if (globToRegExp(pattern).test(targetPath)) return pattern;
  }
  return undefined;
}
