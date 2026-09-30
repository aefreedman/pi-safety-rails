import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { setTimeout } from "node:timers/promises";

// Only an explicit registry E404 proves absence. Network/auth/malformed responses
// must never be converted into permission to attempt another publication.
export function reconcileRegistry(result, version, commit) {
  if (result.error || result.signal) throw new Error("Registry lookup failed");
  let data;
  try {
    data = JSON.parse(result.stdout);
  } catch {
    throw new Error("Registry returned invalid JSON");
  }
  if (result.status !== 0) {
    if (data?.error?.code === "E404") return false;
    throw new Error(`Registry lookup failed: ${data?.error?.code ?? "unknown error"}`);
  }
  if (data?.version !== version || data?.gitHead !== commit) {
    throw new Error("Existing npm version/gitHead does not match the immutable release");
  }
  return true;
}

export async function verifyPublication(lookup, { attempts = 5, wait = setTimeout } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (lookup()) return;
    if (attempt + 1 < attempts) await wait(5000);
  }
  throw new Error("Published version is still absent; reconcile identity before retrying");
}

async function main() {
  const mode = process.argv[2];
  const commit = process.env.RELEASE_COMMIT;
  if (!["preflight", "postpublish"].includes(mode) || !/^[0-9a-f]{40}$/.test(commit ?? "")) {
    throw new Error("Expected preflight/postpublish and full RELEASE_COMMIT");
  }
  const { name, version } = JSON.parse(readFileSync("package.json", "utf8"));
  const lookup = () => reconcileRegistry(spawnSync("npm", [
    "view", `${name}@${version}`, "version", "gitHead", "--json",
    "--registry=https://registry.npmjs.org", "--fetch-retries=0", "--fetch-timeout=15000",
  ], { encoding: "utf8", timeout: 20000 }), version, commit);
  if (mode === "preflight") {
    const published = lookup();
    if (!process.env.GITHUB_OUTPUT) throw new Error("Missing GitHub Actions output path");
    appendFileSync(process.env.GITHUB_OUTPUT, `published=${published}\n`);
    console.log(published ? "Matching npm identity exists; skip publish" : "Version absent; publication may proceed after validation");
  } else {
    await verifyPublication(lookup);
    console.log(`Verified ${name}@${version} gitHead ${commit}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
