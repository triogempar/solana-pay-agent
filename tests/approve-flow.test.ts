import { Keypair, PublicKey } from "@solana/web3.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createToolExecutor } from "../src/lib/agent/execute";
import { createContactStore } from "../src/lib/contacts/store";
import { loadConfig } from "../src/lib/config";
import type { LlmChatResult, LlmClient } from "../src/lib/llm/types";
import type { SolanaGateway } from "../src/lib/solana/gateway";
import { approveTransfer, cancelTransfer, handleChat, type AppDeps } from "../src/lib/server/actions";
import { HttpError } from "../src/lib/http";
import { createTransferStore } from "../src/lib/transfers/store";
import type { TransferRecord } from "../src/lib/types";

function scripted(steps: LlmChatResult[]): LlmClient {
  let index = 0;
  return {
    async chat() {
      const step = steps[index] ?? { content: "", toolCalls: [] };
      index += 1;
      return step;
    },
  };
}

function harness(options?: {
  balance?: bigint;
  devnetError?: string;
  maxSol?: string;
}) {
  const payer = Keypair.generate();
  const sends: { to: string; lamports: bigint }[] = [];
  const gateway: SolanaGateway = {
    getPublicKey: () => payer.publicKey,
    getBalance: async () => options?.balance ?? 2_000_000_000n,
    estimateFee: async () => 5_000n,
    getRecentTransactions: async () => [],
    explainTransaction: async () => null,
    sendSol: async (to, lamports) => {
      sends.push({ to: to.toBase58(), lamports });
      return "sig-approved";
    },
    assertDevnet: async () => {
      if (options?.devnetError) throw new Error(options.devnetError);
    },
  };
  const config = loadConfig({ MAX_SOL_PER_TRANSFER: options?.maxSol ?? "1" });
  const deps: AppDeps = {
    config,
    gateway,
    contacts: createContactStore(),
    transfers: createTransferStore(),
    llm: scripted([]),
    keypairSource: "generated",
  };
  return { deps, sends, payer, config };
}

describe("approve flow", () => {
  it("prepares a transfer from a tool call and signs only after approval", async () => {
    const { deps, sends } = harness();
    const recipient = Keypair.generate().publicKey.toBase58();
    deps.llm = scripted([
      {
        content: "",
        toolCalls: [
          { type: "function", function: { name: "send_sol", arguments: { amount: 0.1, recipient } } },
        ],
      },
      { content: "Review the card and approve it.", toolCalls: [] },
    ]);

    const chat = await handleChat(deps, [{ role: "user", content: `Send 0.1 SOL to ${recipient}` }]);
    expect(sends).toHaveLength(0);
    expect(chat.artifacts[0]).toMatchObject({
      type: "transfer",
      transfer: {
        amountSol: "0.1",
        network: "devnet",
        estimatedFeeSol: "0.000005",
        status: "pending",
        recipient,
      },
    });
    const id = chat.artifacts[0]?.type === "transfer" ? chat.artifacts[0].transfer.id : "";

    const approved = await approveTransfer(deps, id);
    expect(approved.status).toBe("confirmed");
    expect(approved.signature).toBe("sig-approved");
    expect(approved.explorerUrl).toBe("https://explorer.solana.com/tx/sig-approved?cluster=devnet");
    expect(sends).toEqual([{ to: recipient, lamports: 100_000_000n }]);

    const again = await approveTransfer(deps, id);
    expect(again.status).toBe("confirmed");
    expect(sends).toHaveLength(1);
  });

  it("resolves a saved contact and does not broadcast on cancel", async () => {
    const { deps, sends } = harness();
    const recipient = Keypair.generate().publicKey.toBase58();
    await deps.contacts.save("Budi", recipient);
    deps.llm = scripted([
      {
        content: "",
        toolCalls: [
          { type: "function", function: { name: "send_sol", arguments: { amount: "0,1 SOL", recipient: "budi" } } },
        ],
      },
      { content: "", toolCalls: [] },
    ]);

    const chat = await handleChat(deps, [{ role: "user", content: "kirim 0.1 SOL ke Budi" }]);
    expect(chat.locale).toBe("id");
    expect(chat.reply).toContain("Setujui");
    const card = chat.artifacts.find((artifact) => artifact.type === "transfer");
    expect(card?.type === "transfer" && card.transfer.recipient).toBe(recipient);
    expect(card?.type === "transfer" && card.transfer.recipientLabel).toBe("Budi");
    expect(sends).toHaveLength(0);

    const id = card?.type === "transfer" ? card.transfer.id : "";
    const cancelled = await cancelTransfer(deps, id);
    expect(cancelled.status).toBe("cancelled");
    expect(sends).toHaveLength(0);
    await expect(approveTransfer(deps, id)).rejects.toBeInstanceOf(HttpError);
    expect(sends).toHaveLength(0);
  });

  it("refuses amounts over the cap and invalid addresses before any send", async () => {
    const { deps, sends } = harness();
    deps.llm = scripted([
      {
        content: "",
        toolCalls: [
          {
            type: "function",
            function: { name: "send_sol", arguments: { amount: 5, recipient: Keypair.generate().publicKey.toBase58() } },
          },
        ],
      },
      { content: "", toolCalls: [] },
    ]);
    const over = await handleChat(deps, [{ role: "user", content: "send 5 SOL" }]);
    expect(over.artifacts.filter((artifact) => artifact.type === "transfer")).toHaveLength(0);
    expect(over.reply.toLowerCase()).toContain("cap");
    expect(sends).toHaveLength(0);

    deps.llm = scripted([
      {
        content: "",
        toolCalls: [
          { type: "function", function: { name: "send_sol", arguments: { amount: 0.1, recipient: "not-an-address" } } },
        ],
      },
      { content: "", toolCalls: [] },
    ]);
    const bad = await handleChat(deps, [{ role: "user", content: "send 0.1 SOL to nobody" }]);
    expect(bad.artifacts.filter((artifact) => artifact.type === "transfer")).toHaveLength(0);
    expect(bad.reply).toMatch(/contact|address/i);
    expect(sends).toHaveLength(0);
  });

  it("does not sign a tampered transfer above the cap or off devnet", async () => {
    const { deps, sends } = harness();
    const recipient = Keypair.generate().publicKey.toBase58();
    const now = new Date().toISOString();
    const record: TransferRecord = {
      id: crypto.randomUUID(),
      recipient,
      lamports: "2000000000",
      amountSol: "2",
      network: "devnet",
      estimatedFeeLamports: "5000",
      estimatedFeeSol: "0.000005",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    await deps.transfers.create(record);
    const blocked = await approveTransfer(deps, record.id);
    expect(blocked.status).toBe("failed");
    expect(blocked.error).toMatch(/cap/);
    expect(sends).toHaveLength(0);

    const off = harness({ devnetError: "Refusing to sign: not devnet." });
    const pending: TransferRecord = {
      ...record,
      id: crypto.randomUUID(),
      lamports: "100000000",
      amountSol: "0.1",
    };
    await off.deps.transfers.create(pending);
    const refused = await approveTransfer(off.deps, pending.id);
    expect(refused.status).toBe("failed");
    expect(refused.error).toMatch(/devnet/);
    expect(off.sends).toHaveLength(0);
  });

  it("does not prepare a transfer the wallet cannot afford", async () => {
    const { deps, sends } = harness({ balance: 1_000n });
    const recipient = Keypair.generate().publicKey.toBase58();
    const execute = createToolExecutor({
      gateway: deps.gateway,
      contacts: deps.contacts,
      transfers: deps.transfers,
      maxLamports: deps.config.maxLamports,
      maxSolLabel: deps.config.maxSolPerTransfer,
    });
    const result = await execute("send_sol", { amount: 0.1, recipient });
    expect(result.artifacts ?? []).toHaveLength(0);
    expect(JSON.stringify(result.output)).toMatch(/Insufficient balance/);
    expect(sends).toHaveLength(0);
    expect(new PublicKey(recipient).toBase58()).toBe(recipient);
  });

  it("keeps contacts on disk and a single approval wins a double submit", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pay-agent-"));
    const contacts = createContactStore(path.join(dir, "contacts.json"));
    const address = Keypair.generate().publicKey.toBase58();
    await contacts.save("Budi", address);
    const reloaded = createContactStore(path.join(dir, "contacts.json"));
    expect(await reloaded.find("BUDI")).toMatchObject({ name: "Budi", address });

    const { deps, sends } = harness();
    const recipient = Keypair.generate().publicKey.toBase58();
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = false;
    const original = deps.gateway.sendSol;
    deps.gateway.sendSol = async (to, lamports) => {
      entered = true;
      await gate;
      return original(to, lamports);
    };
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await deps.transfers.create({
      id,
      recipient,
      lamports: "1000000",
      amountSol: "0.001",
      network: "devnet",
      estimatedFeeLamports: "5000",
      estimatedFeeSol: "0.000005",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    const first = approveTransfer(deps, id);
    for (let i = 0; i < 30 && !entered; i += 1) await Promise.resolve();
    expect(entered).toBe(true);
    const second = approveTransfer(deps, id);
    release?.();
    const results = await Promise.allSettled([first, second]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(sends).toHaveLength(1);
  });
});
