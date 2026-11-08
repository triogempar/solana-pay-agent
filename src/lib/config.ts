import { parseSolAmount } from "./solana/amount";
import { assertRpcUrlAllowed } from "./solana/devnet";

export type AppConfig = {
  llmBaseUrl: string;
  llmModel: string;
  ollamaApiKey: string;
  rpcUrl: string;
  agentSecretKey: string;
  agentKeypairPath: string;
  maxSolPerTransfer: string;
  maxLamports: bigint;
  contactsPath: string;
  pendingPath: string;
  generatedKeypairPath: string;
  network: "devnet";
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const llmBaseUrl = (env.LLM_BASE_URL?.trim() || "https://ollama.com").replace(/\/$/, "");
  if (!/^https?:\/\//i.test(llmBaseUrl)) {
    throw new Error("LLM_BASE_URL must be an http(s) URL.");
  }
  const rpcUrl = env.SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
  assertRpcUrlAllowed(rpcUrl);

  const maxSolPerTransfer = env.MAX_SOL_PER_TRANSFER?.trim() || "1";
  const maxLamports = parseSolAmount(maxSolPerTransfer);

  return {
    llmBaseUrl,
    llmModel: env.LLM_MODEL?.trim() || "beam",
    ollamaApiKey: env.OLLAMA_API_KEY?.trim() || "",
    rpcUrl,
    agentSecretKey: env.AGENT_SECRET_KEY?.trim() || "",
    agentKeypairPath: env.AGENT_KEYPAIR_PATH?.trim() || "",
    maxSolPerTransfer,
    maxLamports,
    contactsPath: env.CONTACTS_PATH?.trim() || "data/contacts.json",
    pendingPath: env.PENDING_TRANSFERS_PATH?.trim() || "data/pending-transfers.json",
    generatedKeypairPath: "data/agent-keypair.json",
    network: "devnet",
  };
}
