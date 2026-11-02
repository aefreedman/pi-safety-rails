import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import {
  CONFIG_DIR_NAME, VERSION, createAgentSession, DefaultResourceLoader,
  hasTrustRequiringProjectResources, ModelRuntime, ProjectTrustStore,
  SessionManager, SettingsManager,
} from "@earendil-works/pi-coding-agent";

// Exercise the same trust resolver used by the CLI, not a replacement trust stub.
const { resolveProjectTrusted } = await import(new URL(
  "core/project-trust.js", import.meta.resolve("@earendil-works/pi-coding-agent"),
).href);
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("pinned Pi host preserves saved distrust, validation, deny guards and error redaction", async () => {
  assert.equal(VERSION, manifest.devDependencies["@earendil-works/pi-coding-agent"]);
  const root = mkdtempSync(path.join(os.tmpdir(), "pi-safety-host-"));
  const agentDir = path.join(root, "agent");
  const cwd = path.join(root, "project");
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  let session;
  try {
    mkdirSync(agentDir);
    mkdirSync(cwd);
    writeFileSync(path.join(cwd, "AGENTS.md"), "Synthetic trust regression fixture.\n");
    const trustStore = new ProjectTrustStore(agentDir);
    trustStore.set(cwd, false);
    assert.equal(hasTrustRequiringProjectResources(cwd), false, "AGENTS alone does not require trust");
    const resolveTrust = () => resolveProjectTrusted({
      cwd, trustStore, defaultProjectTrust: "always",
      projectTrustContext: { hasUI: false },
    });
    assert.equal(await resolveTrust(), false, "saved distrust overrides automatic trust for AGENTS-only projects");
    const denied = path.join(cwd, "protected.txt").replace(/\\/g, "/");
    writeFileSync(path.join(agentDir, "path-permissions.json"), JSON.stringify({
      permission: { external_directory: { [denied]: "deny" }, edit: { [denied]: "deny" } },
    }));
    mkdirSync(path.join(cwd, CONFIG_DIR_NAME));
    writeFileSync(path.join(cwd, CONFIG_DIR_NAME, "path-permissions.json"), JSON.stringify({
      permission: { external_directory: { [denied]: "allow" }, edit: { [denied]: "allow", "**/local-only.txt": "deny" } },
    }));
    // Project-local deny configuration also does not trigger Pi's resource-based trust prompt.
    assert.equal(await resolveTrust(), false);
    const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
    settingsManager.setProjectTrusted(await resolveTrust());
    let observedTrust;
    const dispatches: Array<Record<string, unknown>> = [];
    const loader = new DefaultResourceLoader({
      cwd, agentDir, settingsManager, noSkills: true, noPromptTemplates: true, noThemes: true,
      additionalExtensionPaths: manifest.pi.extensions.map((p: string) => path.resolve(p)),
      extensionFactories: [(pi) => {
        pi.on("session_start", (_event, ctx) => { observedTrust = ctx.isProjectTrusted(); });
        // Synthetic override: records dispatch without performing a real mutation.
        pi.registerTool({
          name: "write", label: "fixture write", description: "Synthetic guard probe",
          parameters: {
            type: "object", required: ["path", "content"], properties: {
              path: { type: "string" }, content: { type: "string" },
              count: { type: "number", minimum: 1 }, flag: { type: "boolean" },
              tags: { type: "array", items: { type: "string" } }, note: { type: "string" },
            },
          },
          async execute(_id, params) {
            dispatches.push(structuredClone(params));
            if (params.content === "throw") throw new Error("Bearer synthetic-host-secret-0123456789");
            return { content: [{ type: "text", text: "safe" }], details: params };
          },
        });
      }],
    });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    for (const extension of manifest.pi.extensions) {
      assert.ok(loader.getExtensions().extensions.some((loaded) => loaded.path === path.resolve(extension)));
    }
    const modelRuntime = await ModelRuntime.create({
      authPath: path.join(agentDir, "auth.json"), modelsPath: null, refreshOnCreate: false,
    });
    const model = {
      id: "synthetic", name: "Synthetic", provider: "synthetic", api: "openai-completions",
      baseUrl: "http://invalid.local", reasoning: false, input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 10000, maxTokens: 1000,
    };
    ({ session } = await createAgentSession({
      cwd, agentDir, modelRuntime, model, settingsManager, resourceLoader: loader,
      sessionManager: SessionManager.inMemory(cwd), tools: ["write", "read", "edit"],
    }));
    const extensionErrors: unknown[] = [];
    await session.bindExtensions({ onError: (error) => { extensionErrors.push(error); } });
    assert.equal(observedTrust, false);
    let callNumber = 0;
    async function call(name: string, args: Record<string, unknown>) {
      let turn = 0;
      const toolCallId = `probe-${++callNumber}`;
      session.agent.streamFunction = () => {
        const stream = createAssistantMessageEventStream();
        const first = turn++ === 0;
        const message = {
          role: "assistant", api: model.api, provider: model.provider, model: model.id,
          content: first ? [{ type: "toolCall", id: toolCallId, name, arguments: args }] : [{ type: "text", text: "done" }],
          stopReason: first ? "toolUse" : "stop", timestamp: Date.now(),
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        };
        stream.push({ type: "done", reason: message.stopReason, message });
        stream.end();
        return stream;
      };
      // Use the real Agent loop and AgentSession hooks with a local deterministic transport.
      await session.agent.prompt("Synthetic boundary probe");
      const result = session.agent.state.messages.filter((m) => m.role === "toolResult").at(-1);
      assert.ok(result, "host must produce a result, including validation failures");
      assert.equal(result.toolCallId, toolCallId);
      assert.deepEqual(extensionErrors, []);
      return result;
    }
    for (const args of [
      { content: "invalid" }, { path: {}, content: "invalid" },
      { path: "safe.txt", content: "invalid", count: "not-a-number" },
      { path: "safe.txt", content: "invalid", count: 0 },
      { path: "safe.txt", content: "invalid", flag: "not-a-boolean" },
    ]) {
      const before = dispatches.length;
      const result = await call("write", args);
      assert.equal(result.isError, true);
      assert.equal(dispatches.length, before, "invalid mutation request must not dispatch");
    }
    for (const args of [
      { path: denied, content: "blocked" },
      { path: denied, content: "blocked", count: "2", flag: "true", tags: "one", note: null },
    ]) {
      const result = await call("write", args);
      assert.equal(result.isError, true);
      assert.match(JSON.stringify(result.content), /Path mutation denied/);
      assert.equal(dispatches.length, 0, "coercion and project allow rules must not bypass global denial");
    }
    for (const [name, args] of [
      ["read", { path: denied, offset: "1", limit: null }],
      ["edit", { path: denied, oldText: "old", newText: "new" }],
    ] as const) {
      const result = await call(name, args);
      assert.equal(result.isError, true);
      assert.match(JSON.stringify(result.content), /Path (access|mutation) denied/);
    }
    writeFileSync(path.join(cwd, "safe.txt"), "first\nsecond\nthird\n");
    const read = await call("read", { path: "safe.txt", offset: "2", limit: "1" });
    assert.equal(read.isError, false, JSON.stringify(read));
    assert.match(JSON.stringify(read.content), /second/);
    assert.doesNotMatch(JSON.stringify(read.content), /first/);
    assert.equal((await call("read", { path: "safe.txt", offset: null, limit: null })).isError, false);
    const success = await call("write", {
      path: "local-only.txt", content: "safe", count: "2", flag: "false", tags: "one", note: null,
    });
    assert.equal(success.isError, false, "untrusted local deny rules must not be loaded");
    assert.deepEqual(dispatches[0], { path: "local-only.txt", content: "safe", count: 2, flag: false, tags: ["one"] });
    // Even trusted overlays are deny-only: local allows cannot remove a global deny.
    settingsManager.setProjectTrusted(true);
    assert.equal((await call("write", { path: denied, content: "blocked" })).isError, true);
    assert.equal(dispatches.length, 1);
    assert.equal((await call("write", { path: "local-only.txt", content: "blocked" })).isError, true);
    assert.equal(dispatches.length, 1);
    const error = await call("write", { path: "safe.txt", content: "throw" });
    assert.equal(error.isError, true);
    assert.doesNotMatch(JSON.stringify(error), /synthetic-host-secret/);
    assert.match(JSON.stringify(error.content), /REDACTED/);
  } finally {
    session?.dispose();
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(root, { recursive: true, force: true });
  }
});
