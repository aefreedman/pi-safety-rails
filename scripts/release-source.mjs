import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function bindReleaseSource({ event, tag, reviewedCommit, prerelease, version, head, tagCommit }) {
  if (!["release", "workflow_dispatch"].includes(event)) throw new Error("Unsupported release event");
  if (event === "release" && prerelease !== "false") throw new Error("Only stable releases may publish");
  if (!/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(tag ?? "") || tag !== `v${version}`) throw new Error("Tag/version mismatch");
  if (!/^[0-9a-f]{40}$/.test(head ?? "") || tagCommit !== head) throw new Error("Tag/checkout commit mismatch");
  if (event === "workflow_dispatch" && (!/^[0-9a-f]{40}$/.test(reviewedCommit ?? "") || reviewedCommit !== head)) {
    throw new Error("Reviewed commit mismatch");
  }
  return head;
}

function main() {
  const tag = process.env.RELEASE_TAG;
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const commit = bindReleaseSource({
    event: process.env.GITHUB_EVENT_NAME, tag, reviewedCommit: process.env.REVIEWED_COMMIT,
    prerelease: process.env.RELEASE_PRERELEASE, version: pkg.version,
    head: git("rev-parse", "HEAD"), tagCommit: git("rev-parse", "--verify", `refs/tags/${tag}^{commit}`),
  });
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  if (!changelog.split(/\r?\n/).some(line => line.startsWith(`## ${pkg.version} - `))) throw new Error("Missing finalized changelog version");
  if (!process.env.GITHUB_OUTPUT) throw new Error("Missing GitHub Actions output path");
  appendFileSync(process.env.GITHUB_OUTPUT, `commit=${commit}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
