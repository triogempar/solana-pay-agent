import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Connection } from "@solana/web3.js";
import { createToolExecutor } from "../src/lib/agent/execute";
import { loadConfig } from "../src/lib/config";
import { createContactStore } from "../src/lib/contacts/store";
import { formatSol } from "../src/lib/format";
import { loadDotEnv } from "../src/lib/load-dotenv";
import type { LlmClient } from "../src/lib/llm/types";
import { createSolanaGateway } from "../src/lib/solana/gateway";
import { KeypairNotConfigured, loadAgentKeypair } from "../src/lib/solana/wallet";
import { approveTransfer, type AppDeps } from "../src/lib/server/actions";
import { createTransferStore } from "../src/lib/transfers/store";

loadDotEnv();

/**
 * Real devnet flow when a funded key is already configured.
 * Skips with exit 0 when the key is missing or the balance is below 0.002 SOL.
 * Does not call the LLM. Path: save a contact, prepare 0.001 SOL back to the
 * same wallet, approve, then fetch the signature.
 */
async function main() {
  const config = loadConfig();
  let loaded: ReturnType<typeof loadAgentKeypair>;
  try {
    loaded = loadAgentKeypair({
      secretKey: config.agentSecretKey,
      keypairPath: config.agentKeypairPath,
      persistPath: config.generatedKeypairPath,
      allowGenerate: false,
    });
  } catch (err) {
    if (err instanceof KeypairNotConfigured) {
      console.log("SKIP no agent keypair configured (set AGENT_SECRET_KEY or AGENT_KEYPAIR_PATH).");
      return;
    }
    throw err;
  }

  const connection = new Connection(config.rpcUrl, "confirmed");
  const gateway = createSolanaGateway(connection, loaded.keypair);
  await gateway.assertDevnet();
  const balance = await gateway.getBalance();
  if (balance < 2_000_000n) {
    console.log(
      `SKIP balance is ${formatSol(balance)} SOL. Fund ${loaded.keypair.publicKey.toBase58()} at https://faucet.solana.com and rerun.`,
    );
    return;
  }

  const dir = mkdtempSync(path.join(tmpdir(), "solana-pay-agent-"));
  const unusedLlm: LlmClient = {
    async chat() {
      throw new Error("integration flow does not call the LLM");
    },
  };
  const deps: AppDeps = {
    config,
    gateway,
    contacts: createContactStore(path.join(dir, "contacts.json")),
    transfers: createTransferStore(path.join(dir, "pending.json")),
    llm: unusedLlm,
    keypairSource: loaded.source,
  };
  const execute = createToolExecutor({
    gateway,
    contacts: deps.contacts,
    transfers: deps.transfers,
    maxLamports: config.maxLamports,
    maxSolLabel: config.maxSolPerTransfer,
  });

  const address = loaded.keypair.publicKey.toBase58();
  const saved = await execute("save_contact", { name: "Self", address });
  if (saved.output && typeof saved.output === "object" && "error" in saved.output) {
    throw new Error(String((saved.output as { error: string }).error));
  }

  const prepared = await execute("send_sol", { amount: 0.001, recipient: "Self" });
  const card = prepared.artifacts?.find((artifact) => artifact.type === "transfer");
  if (!card || card.type !== "transfer") {
    const message =
      prepared.output && typeof prepared.output === "object" && "error" in prepared.output
        ? String((prepared.output as { error: string }).error)
        : "send_sol did not prepare a transfer";
    throw new Error(message);
  }

  const approved = await approveTransfer(deps, card.transfer.id);
  if (approved.status !== "confirmed" || !approved.signature) {
    throw new Error(approved.error ?? "Transfer was not confirmed.");
  }

  const explained = await execute("explain_transaction", { signature: approved.signature });
  console.log(
    JSON.stringify(
      {
        ok: true,
        address,
        balanceSol: formatSol(balance),
        signature: approved.signature,
        explorerUrl: approved.explorerUrl,
        explanation: explained.output,
      },
      null,
      2,
    ),
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "Devnet flow failed.");
  process.exit(1);
});
