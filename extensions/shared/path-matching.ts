import { existsSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type PathMatchingPlatform = NodeJS.Platform;

function pathApiForPlatform(platform: PathMatchingPlatform): typeof path.posix | typeof path.win32 {
  return platform === "win32" ? path.win32 : path.posix;
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

function expandHome(value: string, platform: PathMatchingPlatform): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) {
    return pathApiForPlatform(platform).join(os.homedir(), value.slice(2));
  }
  return value;
}

function isCaseInsensitivePlatform(platform: PathMatchingPlatform): boolean {
  return platform === "win32" || platform === "darwin";
}

function normalizePattern(pattern: string, platform: PathMatchingPlatform): string {
  return normalizeSlashes(expandHome(pattern.trim(), platform));
}

function escapeRegexCharacter(value: string): string {
  return /[|\\{}()[\]^$+?.]/.test(value) ? `\\${value}` : value;
}

function globToRegExp(pattern: string, platform: PathMatchingPlatform): RegExp {
  const normalized = normalizePattern(pattern, platform);
  const flags = isCaseInsensitivePlatform(platform) ? "i" : "";

  if (normalized.endsWith("/**")) {
    const base = normalized
      .slice(0, -3)
      .split("")
      .map(escapeRegexCharacter)
      .join("");
    return new RegExp(`^${base}(?:/.*)?$`, flags);
  }

  let source = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*" && normalized[index + 1] === "*") {
      source += ".*";
      index += 1;
    } else if (character === "*") {
      source += "[^/]*";
    } else if (character === "?") {
      source += "[^/]";
    } else {
      source += escapeRegexCharacter(character);
    }
  }

  return new RegExp(`^${source}$`, flags);
}

export function stripAtPrefix(value: string): string {
  return value.startsWith("@") ? value.slice(1) : value;
}

export function normalizeInputPath(
  ctxCwd: string,
  rawPath?: string,
  platform: PathMatchingPlatform = process.platform,
): string {
  const candidate = rawPath && rawPath.trim() ? stripAtPrefix(rawPath.trim()) : ctxCwd;
  const expanded = expandHome(candidate, platform);
  const pathApi = pathApiForPlatform(platform);
  const absolute = pathApi.isAbsolute(expanded) ? expanded : pathApi.resolve(ctxCwd, expanded);
  return normalizeSlashes(pathApi.normalize(absolute));
}

function canonicalizeWithNearestExistingAncestor(
  lexicalPath: string,
  platform: PathMatchingPlatform,
): string | undefined {
  // Filesystem resolution can only model the host platform reliably. Injected
  // platforms remain available for lexical unit tests.
  if (platform !== process.platform) return undefined;

  const pathApi = pathApiForPlatform(platform);
  const missingSegments: string[] = [];
  let existingPath = lexicalPath;

  while (!existsSync(existingPath)) {
    const parent = pathApi.dirname(existingPath);
    if (parent === existingPath) return undefined;
    missingSegments.unshift(pathApi.basename(existingPath));
    existingPath = parent;
  }

  try {
    const canonicalAncestor = realpathSync.native(existingPath);
    return normalizeSlashes(pathApi.join(canonicalAncestor, ...missingSegments));
  } catch {
    return undefined;
  }
}

export function normalizeInputPathCandidates(
  ctxCwd: string,
  rawPath?: string,
  platform: PathMatchingPlatform = process.platform,
): string[] {
  const lexicalPath = normalizeInputPath(ctxCwd, rawPath, platform);
  const canonicalPath = canonicalizeWithNearestExistingAncestor(lexicalPath, platform);
  return canonicalPath && canonicalPath !== lexicalPath ? [lexicalPath, canonicalPath] : [lexicalPath];
}

export function firstMatchingPattern(
  targetPath: string,
  patterns: string[],
  platform: PathMatchingPlatform = process.platform,
): string | undefined {
  for (const pattern of patterns) {
    if (globToRegExp(pattern, platform).test(targetPath)) return pattern;
  }
  return undefined;
}
