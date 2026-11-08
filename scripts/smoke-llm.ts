import { loadDotEnv } from "../src/lib/load-dotenv";
import { AGENT_TOOLS } from "../src/lib/llm/tools";
import { createOllamaProvider, redactSecrets } from "../src/lib/llm/provider";
import { loadConfig } from "../src/lib/config";

loadDotEnv();

async function main() {
  const config = loadConfig();
  if (!config.ollamaApiKey) {
    console.error("OLLAMA_API_KEY is not set. Add it to .env or the environment, then rerun npm run smoke:llm.");
    process.exit(1);
  }

  const provider = createOllamaProvider({
    baseUrl: config.llmBaseUrl,
    model: config.llmModel,
    apiKey: config.ollamaApiKey,
  });

  const result = await provider.chat({
    messages: [
      {
        role: "user",
        content: "Call the get_balance tool now. Do not answer in prose until the tool has been called.",
      },
    ],
    tools: AGENT_TOOLS,
  });

  const preview = redactSecrets(result.content, [config.ollamaApiKey]).replace(/\s+/g, " ").slice(0, 240);
  const report = {
    ok: true,
    endpoint: `${config.llmBaseUrl}/api/chat`,
    model: config.llmModel,
    nativeToolCalls: result.toolCalls.length > 0,
    toolCallCount: result.toolCalls.length,
    toolNames: result.toolCalls.map((call) => call.function.name),
    thinkingPresent: Boolean(result.thinking),
    contentPreview: preview,
    note:
      result.toolCalls.length > 0
        ? "Native tool_calls came back."
        : "No native tool_calls. The app will ask for a strict JSON action and parse that.",
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : "LLM smoke failed.";
  console.error(message);
  process.exit(1);
});
