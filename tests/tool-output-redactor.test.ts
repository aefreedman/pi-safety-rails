import assert from "node:assert/strict";
import test from "node:test";
import { ExtensionRunner } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext, ExtensionHandler, ToolResultEvent, ToolResultEventResult } from "@earendil-works/pi-coding-agent";
import toolOutputRedactor from "../extensions/tool-output-redactor.ts";

type Handler = ExtensionHandler<ToolResultEvent, ToolResultEventResult>;
let handler: Handler;
toolOutputRedactor({
  on(name: string, registered: Handler) {
    assert.equal(name, "tool_result");
    handler = registered;
    return () => {};
  },
} as ExtensionAPI);

function event(overrides: Partial<ToolResultEvent> = {}): ToolResultEvent {
  return {
    type: "tool_result", toolName: "fixture", toolCallId: "call/1", parentToolCallId: "call",
    input: { action: "read" }, content: [{ type: "text", text: "safe" }],
    details: { count: 2 }, isError: true,
    usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    ...overrides,
  };
}

// Exercise Pi's actual composition method with only its context and handler registry stubbed.
async function dispatch(input: ToolResultEvent) {
  const before = structuredClone(input);
  const patch = await handler(input, {} as ExtensionContext);
  const result = await ExtensionRunner.prototype.emitToolResult.call({
    createContext: () => ({}),
    extensions: [{ path: "fixture", handlers: new Map([["tool_result", [handler]]]) }],
    emitError: (error: unknown) => assert.fail(JSON.stringify(error)),
  } as unknown as ExtensionRunner, input);
  assert.deepEqual(input, before, "redaction must not mutate the event");
  if (result) {
    assert.equal(result.isError, input.isError);
    assert.equal(result.usage, input.usage);
  }
  return { patch, result };
}

test("redacts nested structured-only secrets without replacing clean content/details", async () => {
  const input = event({ structuredContent: { rows: [{ secret: "ghp_fixtureSecret", count: 3 }], ok: true, empty: null } });
  const { patch, result } = await dispatch(input);
  assert.deepEqual(patch, { structuredContent: { rows: [{ secret: "[REDACTED]", count: 3 }], ok: true, empty: null } });
  assert.deepEqual(result?.structuredContent, patch?.structuredContent);
  assert.equal(result?.content, input.content);
  assert.equal(result?.details, input.details);
});

test("redacts content, structured data, and details together", async () => {
  const { patch, result } = await dispatch(event({
    content: [{ type: "text", text: "Bearer fixtureSecret" }],
    structuredContent: { secret: "ghp_fixtureSecret" }, details: { secret: "ops_fixtureSecret", count: 2 },
  }));
  assert.deepEqual(patch, {
    content: [{ type: "text", text: "Bearer [REDACTED]" }],
    structuredContent: { secret: "[REDACTED]" }, details: { secret: "[REDACTED]", count: 2 },
  });
  assert.deepEqual(result?.structuredContent, patch?.structuredContent);
});

test("preserves clean typed data when only text redacts, including false and null", async () => {
  for (const structuredContent of [{ rows: [1, true, null], status: "ok" }, false, 0, "", null]) {
    const input = event({ content: [{ type: "text", text: "ghp_fixtureSecret" }], structuredContent });
    const { patch, result } = await dispatch(input);
    assert.equal(patch?.structuredContent, structuredContent);
    assert.equal(result?.structuredContent, structuredContent);
    assert.equal(result?.details, input.details);
  }
});

test("does not add structuredContent when absent", async () => {
  const { patch } = await dispatch(event({ content: [{ type: "text", text: "ghp_fixtureSecret" }], details: undefined }));
  assert.deepEqual(patch, { content: [{ type: "text", text: "[REDACTED]" }] });
  assert.equal(Object.hasOwn(patch!, "structuredContent"), false);
});

test("details-only redaction preserves clean structured data and content", async () => {
  const input = event({ details: { rows: ["ops_fixtureSecret"], count: 2 }, structuredContent: { ok: true } });
  const { patch, result } = await dispatch(input);
  assert.deepEqual(patch, { details: { rows: ["[REDACTED]"], count: 2 } });
  assert.equal(result?.content, input.content);
  assert.equal(result?.structuredContent, input.structuredContent);
});

test("returns no replacement for clean results with or without structured data", async () => {
  for (const input of [event(), event({ structuredContent: { rows: [1, false, null], status: "ok" } })]) {
    const { patch, result } = await dispatch(input);
    assert.equal(patch, undefined);
    assert.equal(result, undefined);
  }
});
