import { describe, expect, it } from "vitest";
import { runAgent, type ToolExecution } from "../src/lib/agent/run";
import type { LlmChatResult, LlmClient } from "../src/lib/llm/types";

function scripted(steps: LlmChatResult[]) {
  const requests: { format?: string; toolCount: number }[] = [];
  let index = 0;
  const client: LlmClient = {
    async chat(input) {
      requests.push({ format: input.format, toolCount: input.tools?.length ?? 0 });
      const step = steps[index] ?? { content: "", toolCalls: [] };
      index += 1;
      return step;
    },
  };
  return { client, requests, count: () => index };
}

const context = {
  address: "AgentAddress111",
  contacts: [],
  maxSol: "1",
  locale: "en" as const,
};

describe("agent tool-call fallback", () => {
  it("uses native tool_calls without a second JSON request", async () => {
    const llm = scripted([
      {
        content: "",
        toolCalls: [{ type: "function", function: { name: "get_balance", arguments: {} } }],
      },
      { content: "Your devnet balance is 2 SOL.", toolCalls: [] },
    ]);
    const calls: string[] = [];
    const result = await runAgent({
      history: [{ role: "user", content: "What's my balance?" }],
      llm: llm.client,
      context,
      executeTool: async (name) => {
        calls.push(name);
        return {
          output: { balanceSol: "2" },
          artifacts: [{ type: "balance", address: "AgentAddress111", balanceSol: "2", network: "devnet" }],
        } satisfies ToolExecution;
      },
    });
    expect(calls).toEqual(["get_balance"]);
    expect(result.reply).toBe("Your devnet balance is 2 SOL.");
    expect(result.artifacts[0]).toMatchObject({ type: "balance", balanceSol: "2" });
    expect(llm.count()).toBe(2);
    expect(llm.requests[0]?.format).toBeUndefined();
    expect(llm.requests[0]?.toolCount).toBeGreaterThan(0);
  });

  it("executes a JSON action embedded in content when tool_calls are missing", async () => {
    const llm = scripted([
      { content: '{"action":"get_balance","arguments":{}}', toolCalls: [] },
      { content: "Balance checked.", toolCalls: [] },
    ]);
    const calls: string[] = [];
    const result = await runAgent({
      history: [{ role: "user", content: "balance" }],
      llm: llm.client,
      context,
      executeTool: async (name) => {
        calls.push(name);
        return { output: { ok: true }, artifacts: [{ type: "balance", address: "A", balanceSol: "1", network: "devnet" }] };
      },
    });
    expect(calls).toEqual(["get_balance"]);
    expect(result.reply).toBe("Balance checked.");
    expect(llm.count()).toBe(2);
    expect(llm.requests.every((request) => request.format !== "json")).toBe(true);
  });

  it("asks for strict JSON when the first reply has neither tool_calls nor an action", async () => {
    const llm = scripted([
      { content: "Let me think about that.", toolCalls: [] },
      { content: '{"action":"reply","message":"I can check your devnet balance."}', toolCalls: [] },
    ]);
    const result = await runAgent({
      history: [{ role: "user", content: "What can you do?" }],
      llm: llm.client,
      context,
      executeTool: async () => ({ output: {} }),
    });
    expect(result.reply).toBe("I can check your devnet balance.");
    expect(llm.count()).toBe(2);
    expect(llm.requests[1]?.format).toBe("json");
    expect(llm.requests[1]?.toolCount).toBe(0);
  });

  it("runs a tool returned by the JSON fallback and then summarizes", async () => {
    const llm = scripted([
      { content: "hmm", toolCalls: [] },
      { content: '{"action":"list_contacts","arguments":{}}', toolCalls: [] },
      { content: "You have no contacts yet.", toolCalls: [] },
    ]);
    const calls: string[] = [];
    const result = await runAgent({
      history: [{ role: "user", content: "who do I know?" }],
      llm: llm.client,
      context,
      executeTool: async (name) => {
        calls.push(name);
        return { output: { contacts: [] } };
      },
    });
    expect(calls).toEqual(["list_contacts"]);
    expect(result.reply).toBe("You have no contacts yet.");
    expect(llm.requests[1]?.format).toBe("json");
  });
});
