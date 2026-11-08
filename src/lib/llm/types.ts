export type LlmRole = "system" | "user" | "assistant" | "tool";

export type LlmToolCall = {
  type: "function";
  function: {
    index?: number;
    name: string;
    arguments: Record<string, unknown>;
  };
};

export type LlmMessage = {
  role: LlmRole;
  content: string;
  thinking?: string;
  tool_calls?: LlmToolCall[];
  tool_name?: string;
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type LlmChatResult = {
  content: string;
  thinking?: string;
  toolCalls: LlmToolCall[];
};

export interface LlmClient {
  chat(input: {
    messages: LlmMessage[];
    tools?: ToolDefinition[];
    format?: "json";
  }): Promise<LlmChatResult>;
}
