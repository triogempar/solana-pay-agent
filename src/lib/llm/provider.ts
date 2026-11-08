import type { LlmChatResult, LlmClient, LlmMessage, LlmToolCall, ToolDefinition } from "./types";

export type OllamaProviderOptions = {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/**
 * Ollama `/api/chat` client.
 * Request: { model, messages, tools, stream: false } with `Authorization: Bearer <key>`.
 * Response message may include content, thinking, and tool_calls.
 * The API key is never written to logs or error messages.
 */
export function createOllamaProvider(options: OllamaProviderOptions = {}): LlmClient {
  const baseUrl = (options.baseUrl ?? process.env.LLM_BASE_URL ?? "https://ollama.com").replace(/\/$/, "");
  const model = options.model ?? process.env.LLM_MODEL ?? "beam";
  const apiKey = options.apiKey ?? process.env.OLLAMA_API_KEY ?? "";
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 50_000;

  return {
    async chat({ messages, tools, format }): Promise<LlmChatResult> {
      if (!apiKey.trim()) {
        throw new Error("OLLAMA_API_KEY is not set. Add it to .env and restart.");
      }
      const body: Record<string, unknown> = {
        model,
        messages: messages.map(serializeMessage),
        stream: false,
      };
      if (tools?.length) body.tools = tools;
      if (format) body.format = format;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error("LLM request timed out.");
        }
        throw new Error("LLM request failed (network).");
      } finally {
        clearTimeout(timer);
      }

      const rawText = await response.text();
      if (!response.ok) {
        const preview = redactSecrets(rawText, [apiKey]).slice(0, 240);
        throw new Error(`LLM request failed (${response.status}). ${preview}`.trim());
      }

      let payload: unknown;
      try {
        payload = parseResponseBody(rawText);
      } catch {
        throw new Error("LLM request failed (unreadable response).");
      }
      return normalizeChatResult(payload);
    },
  };
}

export function redactSecrets(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) out = out.split(secret).join("[redacted]");
  }
  return out;
}

export function normalizeChatResult(payload: unknown): LlmChatResult {
  const record = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const message = (record.message && typeof record.message === "object" ? record.message : {}) as Record<
    string,
    unknown
  >;
  const content = typeof message.content === "string" ? message.content : "";
  const thinking = typeof message.thinking === "string" ? message.thinking : undefined;
  const toolCalls = normalizeToolCalls(message.tool_calls ?? record.tool_calls);
  return { content, thinking, toolCalls };
}

export function normalizeToolCalls(raw: unknown): LlmToolCall[] {
  if (!Array.isArray(raw)) return [];
  const calls: LlmToolCall[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const fn = (record.function && typeof record.function === "object" ? record.function : record) as Record<
      string,
      unknown
    >;
    const name = typeof fn.name === "string" ? fn.name.trim() : "";
    if (!name) continue;
    calls.push({
      type: "function",
      function: {
        index: typeof fn.index === "number" ? fn.index : undefined,
        name,
        arguments: normalizeArguments(fn.arguments),
      },
    });
  }
  return calls;
}

function normalizeArguments(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

function serializeMessage(message: LlmMessage): Record<string, unknown> {
  const out: Record<string, unknown> = {
    role: message.role,
    content: message.content ?? "",
  };
  if (message.tool_calls?.length) out.tool_calls = message.tool_calls;
  if (message.tool_name) out.tool_name = message.tool_name;
  if (message.thinking) out.thinking = message.thinking;
  return out;
}

function parseResponseBody(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const lines = trimmed.split("\n").filter(Boolean);
    return JSON.parse(lines[lines.length - 1] ?? "");
  }
}
