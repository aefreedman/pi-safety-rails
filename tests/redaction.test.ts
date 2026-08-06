import assert from "node:assert/strict";
import test from "node:test";
import { redactSensitiveText } from "../extensions/shared/redaction.ts";

test("redacts 1Password references without malformed delimiters", () => {
  assert.equal(
    redactSensitiveText("secret reference: op://example-vault/example-item/password"),
    "secret reference: op://[REDACTED]/[REDACTED]/[REDACTED]",
  );
});
