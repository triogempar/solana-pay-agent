import { afterEach, describe, expect, it, vi } from "vitest";
import { createOllamaProvider, normalizeChatResult, redactSecrets } from "../src/lib/llm/provider";

const KEY = "super-secret-ollama-key";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Ollama provider", () => {
  it("posts the documented chat body and bearer token without logging the key", async () => {
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});
    const infos = vi.spyOn(console, "info").mockImplementation(() => {});
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(
        JSON.stringify({
          message: {
            role: "assistant",
            content: "",
            thinking: "checking",
            tool_calls: [
              {
                type: "function",
                function: { index: 0, name: "get_balance", arguments: {} },
              },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const provider = createOllamaProvider({
      baseUrl: "https://ollama.com",
      model: "beam",
      apiKey: KEY,
      fetchImpl,
    });
    const result = await provider.chat({
      messages: [{ role: "user", content: "balance?" }],
      tools: [
        {
          type: "function",
          function: { name: "get_balance", description: "balance", parameters: { type: "object" } },
        },
      ],
    });

    expect(captured?.url).toBe("https://ollama.com/api/chat");
    const headers = new Headers(captured?.init.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(String(captured?.init.body)) as {
      model: string;
      stream: boolean;
      tools: unknown[];
    };
    expect(body.model).toBe("beam");
    expect(body.stream).toBe(false);
    expect(body.tools).toHaveLength(1);
    expect(result.toolCalls[0]?.function.name).toBe("get_balance");
    expect(result.thinking).toBe("checking");
    const printed = [logs, infos, errors, warnings].flatMap((spy) => spy.mock.calls.flat().map(String)).join("\n");
    expect(printed).not.toContain(KEY);
  });

  it("normalizes string arguments and redacts the key from error bodies", async () => {
    expect(
      normalizeChatResult({
        message: {
          content: "",
          tool_calls: [{ function: { name: "send_sol", arguments: '{"amount":0.1,"recipient":"Budi"}' } }],
        },
      }).toolCalls[0]?.function.arguments,
    ).toEqual({ amount: 0.1, recipient: "Budi" });

    const fetchImpl = (async () =>
      new Response(`unauthorized ${KEY}`, { status: 401 })) as typeof fetch;
    const provider = createOllamaProvider({
      baseUrl: "https://ollama.com/",
      model: "beam",
      apiKey: KEY,
      fetchImpl,
    });
    await expect(provider.chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(/401/);
    await expect(provider.chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(/\[redacted\]/);
    await expect(provider.chat({ messages: [{ role: "user", content: "hi" }] })).rejects.not.toThrow(KEY);
  });

  it("refuses to call the API when the key is missing", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const provider = createOllamaProvider({ apiKey: "  ", fetchImpl });
    await expect(provider.chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(/OLLAMA_API_KEY/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("redactSecrets", () => {
  it("replaces secret values", () => {
    expect(redactSecrets(`token ${KEY} end`, [KEY])).toBe("token [redacted] end");
  });
});
