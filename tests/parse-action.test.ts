import { describe, expect, it } from "vitest";
import { parseActionFromText } from "../src/lib/llm/parse-action";

describe("parseActionFromText", () => {
  it("parses a strict tool action", () => {
    expect(parseActionFromText('{"action":"get_balance","arguments":{}}')).toEqual({
      kind: "tool",
      name: "get_balance",
      arguments: {},
    });
  });

  it("parses fenced JSON surrounded by prose", () => {
    const text = `Sure, I'll do that.
\`\`\`json
{"action":"send_sol","arguments":{"amount":0.1,"recipient":"Budi"}}
\`\`\`
`;
    expect(parseActionFromText(text)).toEqual({
      kind: "tool",
      name: "send_sol",
      arguments: { amount: 0.1, recipient: "Budi" },
    });
  });

  it("accepts flat fields when arguments are omitted", () => {
    expect(parseActionFromText('{"tool":"save_contact","name":"Budi","address":"abc"}')).toEqual({
      kind: "tool",
      name: "save_contact",
      arguments: { name: "Budi", address: "abc" },
    });
  });

  it("parses stringified arguments and Ollama-shaped tool_calls", () => {
    const text = JSON.stringify({
      tool_calls: [
        {
          function: {
            name: "explain_transaction",
            arguments: JSON.stringify({ signature: "a".repeat(88) }),
          },
        },
      ],
    });
    expect(parseActionFromText(text)).toEqual({
      kind: "tool",
      name: "explain_transaction",
      arguments: { signature: "a".repeat(88) },
    });
  });

  it("parses a reply action", () => {
    expect(parseActionFromText('{"action":"reply","message":"Saldo kamu 1 SOL."}')).toEqual({
      kind: "reply",
      message: "Saldo kamu 1 SOL.",
    });
  });

  it("parses the first action in an array", () => {
    expect(parseActionFromText('[{"action":"list_contacts","arguments":{}},{"action":"reply","message":"no"}]')).toEqual({
      kind: "tool",
      name: "list_contacts",
      arguments: {},
    });
  });

  it("returns none for prose or unknown actions", () => {
    expect(parseActionFromText("What's my balance?")).toEqual({ kind: "none" });
    expect(parseActionFromText('{"action":"drain_wallet"}')).toEqual({ kind: "none" });
    expect(parseActionFromText("{not json")).toEqual({ kind: "none" });
    expect(parseActionFromText("")).toEqual({ kind: "none" });
  });
});
