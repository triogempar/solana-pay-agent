import { TOOL_NAMES } from "./tools";

const TOOL_SET = new Set(TOOL_NAMES);

export type ParsedAction =
  | { kind: "tool"; name: string; arguments: Record<string, unknown> }
  | { kind: "reply"; message: string }
  | { kind: "none" };

/** Pull a strict JSON action out of model text (raw JSON, fenced JSON, or surrounding prose). */
export function parseActionFromText(text: string): ParsedAction {
  if (!text?.trim()) return { kind: "none" };
  for (const value of extractJsonValues(text)) {
    const parsed = interpret(value);
    if (parsed.kind !== "none") return parsed;
  }
  return { kind: "none" };
}

export function extractJsonValues(text: string): unknown[] {
  const values: unknown[] = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (const match of text.matchAll(fence)) {
    pushParsed(values, match[1]);
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== "{" && ch !== "[") continue;
    const end = findJsonEnd(text, i);
    if (end < 0) continue;
    if (pushParsed(values, text.slice(i, end + 1))) i = end;
  }
  return values;
}

function pushParsed(values: unknown[], raw: string): boolean {
  try {
    values.push(JSON.parse(raw.trim()));
    return true;
  } catch {
    return false;
  }
}

function findJsonEnd(text: string, start: number): number {
  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === opener) depth += 1;
    else if (ch === closer) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function interpret(value: unknown): ParsedAction {
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = interpret(item);
      if (parsed.kind !== "none") return parsed;
    }
    return { kind: "none" };
  }
  if (!value || typeof value !== "object") return { kind: "none" };
  const record = value as Record<string, unknown>;

  if (Array.isArray(record.tool_calls)) {
    for (const call of record.tool_calls) {
      const parsed = interpret(call);
      if (parsed.kind !== "none") return parsed;
    }
  }
  if (record.function_call && typeof record.function_call === "object") {
    const parsed = interpret(record.function_call);
    if (parsed.kind !== "none") return parsed;
  }
  if (record.function && typeof record.function === "object") {
    const parsed = interpret(record.function);
    if (parsed.kind === "tool") return parsed;
  }

  const action = stringField(record, ["action", "tool"]);
  if (action === "reply" || action === "respond" || action === "message") {
    const message = stringField(record, ["message", "content", "text"]);
    if (message) return { kind: "reply", message };
    return { kind: "none" };
  }
  if (action && TOOL_SET.has(action)) {
    return { kind: "tool", name: action, arguments: toolArguments(record, true) };
  }
  const name = stringField(record, ["name"]);
  if (name && TOOL_SET.has(name)) {
    return { kind: "tool", name, arguments: toolArguments(record, false) };
  }
  return { kind: "none" };
}

function toolArguments(record: Record<string, unknown>, keepName: boolean): Record<string, unknown> {
  const nested = record.arguments ?? record.args;
  if (typeof nested === "string") {
    try {
      const parsed = JSON.parse(nested) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...(nested as Record<string, unknown>) };
  }
  const skip = new Set([
    "action",
    "tool",
    "type",
    "arguments",
    "args",
    "message",
    "content",
    "text",
    "function",
    "tool_calls",
    "function_call",
  ]);
  if (!keepName) skip.add("name");
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (skip.has(key)) continue;
    rest[key] = value;
  }
  return rest;
}

function stringField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
