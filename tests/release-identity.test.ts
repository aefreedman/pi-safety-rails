import assert from "node:assert/strict";
import test from "node:test";
import { reconcileRegistry, verifyPublication } from "../scripts/release-identity.mjs";

const commit = "a".repeat(40);
const result = (data: unknown, status = 0) => ({ status, stdout: JSON.stringify(data) });

test("release retry skips only an exact published version/commit", () => {
  assert.equal(reconcileRegistry(result({ version: "0.2.0", gitHead: commit }), "0.2.0", commit), true);
  for (const data of [{ version: "0.2.0" }, { version: "0.1.6", gitHead: commit },
    { version: "0.2.0", gitHead: "b".repeat(40) }, null, []]) {
    assert.throws(() => reconcileRegistry(result(data), "0.2.0", commit), /does not match/);
  }
});

test("only explicit E404 authorizes a missing-version publish", () => {
  assert.equal(reconcileRegistry(result({ error: { code: "E404" } }, 1), "0.2.0", commit), false);
  for (const code of ["E401", "E403", "E429", "E500", "ETIMEDOUT", "ENOTFOUND"]) {
    assert.throws(() => reconcileRegistry(result({ error: { code } }, 1), "0.2.0", commit), /lookup failed/);
  }
  assert.throws(() => reconcileRegistry({ status: 1, stdout: "not json" }, "0.2.0", commit), /invalid JSON/);
  assert.throws(() => reconcileRegistry({ error: new Error("offline") }, "0.2.0", commit), /lookup failed/);
  assert.throws(() => reconcileRegistry({ signal: "SIGTERM" }, "0.2.0", commit), /lookup failed/);
  assert.throws(() => reconcileRegistry(result({ error: { code: "E404" } }), "0.2.0", commit), /does not match/);
});

test("postpublish waits only for bounded absence, never masks identity or infrastructure errors", async () => {
  let calls = 0;
  const delays: number[] = [];
  await verifyPublication(() => ++calls === 3, { wait: async (ms: number) => { delays.push(ms); } });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [5000, 5000]);
  await assert.rejects(verifyPublication(() => false, { attempts: 2, wait: async () => {} }), /still absent/);
  calls = 0;
  await assert.rejects(verifyPublication(() => { calls++; throw new Error("identity mismatch"); }), /identity mismatch/);
  assert.equal(calls, 1);
});
