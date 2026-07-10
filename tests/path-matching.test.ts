import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  firstMatchingPattern,
  normalizeInputPath,
  normalizeInputPathCandidates,
} from "../extensions/shared/path-matching.ts";

const darwinPattern = "/Users/Aaron/Library/Keychains/**";

test("Darwin matching is case-insensitive and returns the original rule casing", () => {
  assert.equal(
    firstMatchingPattern("/users/aaron/library/keychains/login.keychain-db", [darwinPattern], "darwin"),
    darwinPattern,
  );
  assert.equal(
    firstMatchingPattern("/USERS/AARON/LIBRARY/KEYCHAINS", [darwinPattern], "darwin"),
    darwinPattern,
  );
});

test("Windows matching is case-insensitive while Linux remains case-sensitive", () => {
  const windowsPattern = "C:/Users/Aaron/Secrets/**";
  assert.equal(
    firstMatchingPattern("c:/users/AARON/secrets/token.txt", [windowsPattern], "win32"),
    windowsPattern,
  );
  assert.equal(
    firstMatchingPattern("/users/aaron/library/keychains/login.keychain-db", [darwinPattern], "linux"),
    undefined,
  );
  assert.equal(
    firstMatchingPattern("/Users/Aaron/Library/Keychains/login.keychain-db", [darwinPattern], "linux"),
    darwinPattern,
  );
});

test("a trailing /** matches its base and descendants but not sibling prefixes", () => {
  assert.equal(firstMatchingPattern("/Users/Aaron/Secrets", ["/Users/Aaron/Secrets/**"], "darwin"), "/Users/Aaron/Secrets/**");
  assert.equal(firstMatchingPattern("/Users/Aaron/Secrets/nested/file.txt", ["/Users/Aaron/Secrets/**"], "darwin"), "/Users/Aaron/Secrets/**");
  assert.equal(firstMatchingPattern("/Users/Aaron/Secrets-old/file.txt", ["/Users/Aaron/Secrets/**"], "darwin"), undefined);
});

test("relative input paths normalize with injected platform semantics and preserve display casing", () => {
  assert.equal(
    normalizeInputPath("/Users/Aaron/Project", "../Sensitive/Report.TXT", "darwin"),
    "/Users/Aaron/Sensitive/Report.TXT",
  );
  assert.equal(
    normalizeInputPath("C:\\Users\\Aaron\\Project", "..\\Sensitive\\Report.TXT", "win32"),
    "C:/Users/Aaron/Sensitive/Report.TXT",
  );
  assert.equal(
    normalizeInputPath("/Users/Aaron/Project", "@../Sensitive/Report.TXT", "darwin"),
    "/Users/Aaron/Sensitive/Report.TXT",
  );
});

test("external_directory and edit deny lists use equivalent matching behavior", () => {
  const rules = {
    external_directory: [darwinPattern],
    edit: [darwinPattern],
  };
  const target = "/users/aaron/library/keychains/login.keychain-db";

  for (const patterns of [rules.external_directory, rules.edit]) {
    assert.equal(firstMatchingPattern(target, patterns, "darwin"), darwinPattern);
  }
});

test("canonical candidates prevent symlink or junction bypasses, including new files", () => {
  const fixtureDirectory = mkdtempSync(path.join(os.tmpdir(), "pi-safety-rails-links-"));
  const projectDirectory = path.join(fixtureDirectory, "project");
  const protectedDirectory = path.join(fixtureDirectory, "protected");
  const linkedDirectory = path.join(projectDirectory, "linked");

  try {
    mkdirSync(projectDirectory);
    mkdirSync(protectedDirectory);
    symlinkSync(protectedDirectory, linkedDirectory, process.platform === "win32" ? "junction" : "dir");

    const candidates = normalizeInputPathCandidates(projectDirectory, path.join("linked", "new-secret.txt"));
    const protectedPattern = `${protectedDirectory.replace(/\\/g, "/")}/**`;
    assert.equal(candidates.length, 2, `expected lexical and canonical candidates: ${candidates.join(", ")}`);
    assert.equal(
      candidates.some((candidate) => firstMatchingPattern(candidate, [protectedPattern]) === protectedPattern),
      true,
      `canonical path should match protected destination: ${candidates.join(", ")}`,
    );
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test("the selected Node test runner reports assertion failures as non-zero", () => {
  const fixtureDirectory = mkdtempSync(path.join(os.tmpdir(), "pi-safety-rails-runner-"));
  const fixturePath = path.join(fixtureDirectory, "intentional-failure.test.mjs");

  try {
    writeFileSync(
      fixturePath,
      'import assert from "node:assert/strict"; import test from "node:test"; test("intentional", () => assert.equal(1, 2));\n',
    );
    const childEnvironment = { ...process.env };
    delete childEnvironment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--test", fixturePath], {
      encoding: "utf8",
      env: childEnvironment,
    });
    assert.notEqual(result.status, 0, `expected non-zero status; stdout: ${result.stdout}\nstderr: ${result.stderr}`);
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});
