import { parseActionFromText, type ParsedAction } from "../llm/parse-action";
import { JSON_ACTION_INSTRUCTION, buildSystemPrompt } from "../llm/system-prompt";
import { AGENT_TOOLS } from "../llm/tools";
import type { LlmClient, LlmMessage, LlmToolCall } from "../llm/types";
import type { Artifact, Contact, HistoryMessage, Locale } from "../types";

export type ToolExecution = {
  output: unknown;
  artifacts?: Artifact[];
};

export type ToolTrace = {
  name: string;
  output: unknown;
};

type Decision =
  | { type: "reply"; text: string }
  | { type: "calls"; calls: LlmToolCall[]; assistantContent: string; thinking?: string };

export async function runAgent(options: {
  history: HistoryMessage[];
  llm: LlmClient;
  executeTool: (name: string, args: Record<string, unknown>) => Promise<ToolExecution>;
  context: {
    address: string;
    contacts: Pick<Contact, "name" | "address">[];
    maxSol: string;
    locale: Locale;
  };
  maxRounds?: number;
}): Promise<{ reply: string; artifacts: Artifact[]; toolsUsed: string[] }> {
  const maxRounds = options.maxRounds ?? 4;
  const artifacts: Artifact[] = [];
  const toolsUsed: string[] = [];
  const traces: ToolTrace[] = [];
  const messages: LlmMessage[] = [
    { role: "system", content: buildSystemPrompt(options.context) },
    ...options.history.map((message) => ({ role: message.role, content: message.content })),
  ];

  for (let round = 0; round < maxRounds; round++) {
    const response = await options.llm.chat({ messages, tools: AGENT_TOOLS });
    const decision = await resolveDecision(response, round, messages, options.llm);
    if (decision.type === "reply") {
      return {
        reply: decision.text.trim() || synthesizeReply(options.context.locale, artifacts, traces),
        artifacts,
        toolsUsed,
      };
    }

    messages.push({
      role: "assistant",
      content: decision.assistantContent,
      tool_calls: decision.calls,
      thinking: decision.thinking,
    });

    for (const call of decision.calls.slice(0, 3)) {
      const name = call.function.name;
      toolsUsed.push(name);
      let output: unknown;
      let extra: Artifact[] = [];
      try {
        const executed = await options.executeTool(name, call.function.arguments ?? {});
        output = executed.output;
        extra = executed.artifacts ?? [];
      } catch (err) {
        output = { error: err instanceof Error ? err.message : "Tool failed." };
      }
      if (extra.length) artifacts.push(...extra);
      traces.push({ name, output });
      messages.push({
        role: "tool",
        tool_name: name,
        content: JSON.stringify(output),
      });
    }
  }

  return {
    reply: synthesizeReply(options.context.locale, artifacts, traces),
    artifacts,
    toolsUsed,
  };
}

async function resolveDecision(
  response: { content: string; thinking?: string; toolCalls: LlmToolCall[] },
  round: number,
  messages: LlmMessage[],
  llm: LlmClient,
): Promise<Decision> {
  if (response.toolCalls.length) {
    return {
      type: "calls",
      calls: response.toolCalls,
      assistantContent: response.content,
      thinking: response.thinking,
    };
  }

  const parsed = parseActionFromText(response.content);
  if (parsed.kind === "tool") return callsFrom(parsed, response.content, response.thinking);
  if (parsed.kind === "reply") return { type: "reply", text: parsed.message };
  if (round > 0) return { type: "reply", text: response.content };

  const fallbackMessages: LlmMessage[] = [
    ...messages,
    ...(response.content.trim() ? [{ role: "assistant" as const, content: response.content }] : []),
    { role: "user", content: JSON_ACTION_INSTRUCTION },
  ];
  const fallback = await llm.chat({ messages: fallbackMessages, format: "json" });
  const parsedFallback = parseActionFromText(fallback.content);
  if (parsedFallback.kind === "tool") return callsFrom(parsedFallback, fallback.content);
  if (parsedFallback.kind === "reply") return { type: "reply", text: parsedFallback.message };
  if (response.content.trim() && !looksLikeJson(response.content)) {
    return { type: "reply", text: response.content };
  }
  if (fallback.content.trim() && !looksLikeJson(fallback.content)) {
    return { type: "reply", text: fallback.content };
  }
  return { type: "reply", text: "" };
}

function callsFrom(parsed: Extract<ParsedAction, { kind: "tool" }>, content: string, thinking?: string): Decision {
  return {
    type: "calls",
    calls: [
      {
        type: "function",
        function: { name: parsed.name, arguments: parsed.arguments },
      },
    ],
    assistantContent: content,
    thinking,
  };
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

export function synthesizeReply(locale: Locale, artifacts: Artifact[], traces: ToolTrace[]): string {
  const id = locale === "id";
  const transfer = artifacts.find((artifact) => artifact.type === "transfer");
  if (transfer?.type === "transfer") {
    const view = transfer.transfer;
    const who = view.recipientLabel ?? view.recipient;
    if (id) {
      return `Saya menyiapkan transfer ${view.amountSol} SOL ke ${who} di devnet. Belum terkirim. Periksa kartu, lalu tekan Setujui.`;
    }
    return `I've prepared a transfer of ${view.amountSol} SOL to ${who} on devnet. Nothing has been sent. Review the card and press Approve.`;
  }

  const balance = artifacts.find((artifact) => artifact.type === "balance");
  if (balance?.type === "balance") {
    return id
      ? `Saldo devnet Anda ${balance.balanceSol} SOL.`
      : `Your devnet balance is ${balance.balanceSol} SOL.`;
  }

  const txs = artifacts.find((artifact) => artifact.type === "transactions");
  if (txs?.type === "transactions") {
    if (txs.items.length === 0) {
      return id ? "Belum ada transaksi untuk dompet ini." : "No transactions yet for this wallet.";
    }
    return id ? "Ini transaksi terbaru Anda." : "Here are your latest transactions.";
  }

  const explanation = artifacts.find((artifact) => artifact.type === "explanation");
  if (explanation?.type === "explanation") {
    return id
      ? "Saya sudah mengambil transaksinya. Ringkasan ada di kartu di bawah."
      : explanation.explanation.summary;
  }

  const saved = artifacts.find((artifact) => artifact.type === "contact_saved");
  if (saved?.type === "contact_saved") {
    return id ? `Kontak ${saved.name} tersimpan.` : `Saved ${saved.name}.`;
  }

  const error = traces.map((trace) => errorOf(trace.output)).find(Boolean);
  if (error) {
    return id ? `Saya tidak bisa melakukan itu. ${error}` : `I couldn't do that. ${error}`;
  }

  return id
    ? "Saya bisa cek saldo, menyimpan kontak, menampilkan transaksi, menjelaskan tanda tangan, dan menyiapkan transfer SOL di devnet. Saya tidak menandatangani sebelum Anda menekan Setujui."
    : "I can check your balance, save contacts, list recent transactions, explain a signature, and prepare a devnet SOL transfer. I never sign until you press Approve.";
}

function errorOf(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const error = (output as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : null;
}
