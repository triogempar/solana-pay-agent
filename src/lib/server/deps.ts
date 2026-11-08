import { Connection } from "@solana/web3.js";
import { createContactStore } from "../contacts/store";
import { loadConfig } from "../config";
import { createOllamaProvider } from "../llm/provider";
import { createSolanaGateway } from "../solana/gateway";
import { loadAgentKeypair } from "../solana/wallet";
import { createTransferStore } from "../transfers/store";
import type { AppDeps } from "./actions";

let cached: AppDeps | null = null;

export function getDeps(): AppDeps {
  if (!cached) cached = createProductionDeps();
  return cached;
}

export function createProductionDeps(): AppDeps {
  const config = loadConfig();
  const loaded = loadAgentKeypair({
    secretKey: config.agentSecretKey,
    keypairPath: config.agentKeypairPath,
    persistPath: config.generatedKeypairPath,
    allowGenerate: true,
  });
  const connection = new Connection(config.rpcUrl, "confirmed");
  return {
    config,
    gateway: createSolanaGateway(connection, loaded.keypair),
    contacts: createContactStore(config.contactsPath),
    transfers: createTransferStore(config.pendingPath),
    llm: createOllamaProvider({
      baseUrl: config.llmBaseUrl,
      model: config.llmModel,
      apiKey: config.ollamaApiKey,
    }),
    keypairSource: loaded.source,
  };
}
