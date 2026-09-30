import assert from "node:assert/strict";
import test from "node:test";
import { bindReleaseSource } from "../scripts/release-source.mjs";

const commit = "a".repeat(40);
const source = { event: "release", tag: "v0.2.0", prerelease: "false", version: "0.2.0", head: commit, tagCommit: commit };

test("stable release binds to dereferenced checked-out tag without dispatch inputs or event SHA", () => {
  assert.equal(bindReleaseSource(source), commit);
});

test("manual recovery requires the full reviewed commit matching the checked-out tag", () => {
  assert.equal(bindReleaseSource({ ...source, event: "workflow_dispatch", reviewedCommit: commit, prerelease: undefined }), commit);
  for (const reviewedCommit of [undefined, "", "a".repeat(7), "b".repeat(40)]) {
    assert.throws(() => bindReleaseSource({ ...source, event: "workflow_dispatch", reviewedCommit }), /Reviewed commit mismatch/);
  }
});

test("both routes reject empty, wrong or unstable tags and tag/checkout mismatches", () => {
  for (const event of ["release", "workflow_dispatch"]) {
    const input = { ...source, event, reviewedCommit: commit };
    for (const tag of [undefined, "", "main", "v0.1.6", "v0.2.0-beta.1"]) {
      assert.throws(() => bindReleaseSource({ ...input, tag }), /Tag\/version mismatch/);
    }
    assert.throws(() => bindReleaseSource({ ...input, tagCommit: "b".repeat(40) }), /Tag\/checkout commit mismatch/);
    assert.throws(() => bindReleaseSource({ ...input, head: "a".repeat(7) }), /Tag\/checkout commit mismatch/);
  }
  assert.throws(() => bindReleaseSource({ ...source, prerelease: "true" }), /Only stable/);
  assert.throws(() => bindReleaseSource({ ...source, prerelease: undefined }), /Only stable/);
  assert.throws(() => bindReleaseSource({ ...source, event: "push" }), /Unsupported/);
});
