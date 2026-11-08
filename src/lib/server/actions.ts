import { PublicKey } from "@solana/web3.js";
import { createToolExecutor } from "../agent/execute";
import { runAgent } from "../agent/run";
import type { ContactStore } from "../contacts/store";
import { explorerAddress, explorerTx, formatSol, FAUCET_URL } from "../format";
import { HttpError } from "../http";
import { detectLocale } from "../locale";
import type { LlmClient } from "../llm/types";
import { assertWithinCap } from "../solana/amount";
import { insufficientBalanceMessage, type SolanaGateway } from "../solana/gateway";
import { assertValidAddress } from "../solana/validate";
import type { TransferStore } from "../transfers/store";
import type {
  ChatResponse,
  HistoryMessage,
  TransferRecord,
  TransferView,
  WalletStatus,
} from "../types";
import type { AppConfig } from "../config";
import type { KeypairSource } from "../solana/wallet";

export type AppDeps = {
  config: AppConfig;
  gateway: SolanaGateway;
  contacts: ContactStore;
  transfers: TransferStore;
  llm: LlmClient;
  keypairSource: KeypairSource;
};

export function sanitizeHistory(input: unknown): HistoryMessage[] {
  if (!Array.isArray(input)) throw new HttpError(400, "messages must be an array.");
  const messages: HistoryMessage[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const record = item as { role?: unknown; content?: unknown };
    if ((record.role === "user" || record.role === "assistant") && typeof record.content === "string") {
      const content = record.content.trim();
      if (content) messages.push({ role: record.role, content: content.slice(0, 4000) });
    }
  }
  return messages.slice(-12);
}

export async function handleChat(deps: AppDeps, rawMessages: unknown): Promise<ChatResponse> {
  const history = sanitizeHistory(rawMessages);
  const latest = history[history.length - 1];
  if (!latest || latest.role !== "user") throw new HttpError(400, "Send a user message.");
  if (latest.content.length > 2000) throw new HttpError(400, "Message is too long.");
  const locale = detectLocale(latest.content);
  const contacts = await deps.contacts.list();
  const result = await runAgent({
    history,
    llm: deps.llm,
    context: {
      address: deps.gateway.getPublicKey().toBase58(),
      contacts,
      maxSol: deps.config.maxSolPerTransfer,
      locale,
    },
    executeTool: createToolExecutor({
      gateway: deps.gateway,
      contacts: deps.contacts,
      transfers: deps.transfers,
      maxLamports: deps.config.maxLamports,
      maxSolLabel: deps.config.maxSolPerTransfer,
    }),
  });
  return { ...result, locale };
}

export async function approveTransfer(deps: AppDeps, id: string): Promise<TransferView> {
  assertTransferId(id);
  const existing = await deps.transfers.get(id);
  if (!existing) throw new HttpError(404, "Transfer not found.");
  if (existing.status === "confirmed") return toTransferView(existing);
  if (existing.status !== "pending") {
    throw new HttpError(409, `Transfer is ${existing.status} and cannot be approved.`);
  }

  let lamports: bigint;
  try {
    assertValidAddress(existing.recipient);
    lamports = BigInt(existing.lamports);
    assertWithinCap(lamports, deps.config.maxLamports, deps.config.maxSolPerTransfer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transfer failed validation.";
    const failed = await deps.transfers.transition(id, ["pending"], { status: "failed", error: message });
    return toTransferView(failed ?? { ...existing, status: "failed", error: message });
  }

  const locked = await deps.transfers.transition(id, ["pending"], { status: "submitting" });
  if (!locked) {
    const current = await deps.transfers.get(id);
    if (current?.status === "confirmed") return toTransferView(current);
    throw new HttpError(409, "Transfer is no longer pending.");
  }

  try {
    await deps.gateway.assertDevnet();
    const balance = await deps.gateway.getBalance();
    const fee = BigInt(existing.estimatedFeeLamports || "0");
    if (balance < lamports + fee) {
      throw new Error(insufficientBalanceMessage(balance, lamports + fee));
    }
    const signature = await deps.gateway.sendSol(new PublicKey(existing.recipient), lamports);
    const confirmed = await deps.transfers.transition(id, ["submitting"], {
      status: "confirmed",
      signature,
      error: undefined,
    });
    return toTransferView(confirmed ?? { ...locked, status: "confirmed", signature });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed.";
    const failed = await deps.transfers.transition(id, ["submitting"], { status: "failed", error: message });
    return toTransferView(failed ?? { ...locked, status: "failed", error: message });
  }
}

export async function cancelTransfer(deps: AppDeps, id: string): Promise<TransferView> {
  assertTransferId(id);
  const existing = await deps.transfers.get(id);
  if (!existing) throw new HttpError(404, "Transfer not found.");
  if (existing.status === "cancelled") return toTransferView(existing);
  if (existing.status !== "pending") {
    throw new HttpError(409, `Transfer is ${existing.status} and cannot be cancelled.`);
  }
  const updated = await deps.transfers.transition(id, ["pending"], { status: "cancelled" });
  if (!updated) throw new HttpError(409, "Transfer is no longer pending.");
  return toTransferView(updated);
}

export async function getWalletStatus(deps: AppDeps): Promise<WalletStatus> {
  const address = deps.gateway.getPublicKey().toBase58();
  const status: WalletStatus = {
    address,
    balanceLamports: "0",
    balanceSol: "0",
    network: "devnet",
    faucetUrl: FAUCET_URL,
    maxSolPerTransfer: deps.config.maxSolPerTransfer,
    keypairSource: deps.keypairSource,
    explorerUrl: explorerAddress(address),
    clusterOk: false,
  };
  try {
    await deps.gateway.assertDevnet();
    status.clusterOk = true;
  } catch (err) {
    status.clusterError = err instanceof Error ? err.message : "Cluster check failed.";
  }
  try {
    const lamports = await deps.gateway.getBalance();
    status.balanceLamports = lamports.toString();
    status.balanceSol = formatSol(lamports);
  } catch (err) {
    status.balanceError = err instanceof Error ? err.message : "Balance unavailable.";
  }
  return status;
}

export function toTransferView(record: TransferRecord): TransferView {
  const status = record.status === "submitting" ? "pending" : record.status;
  return {
    id: record.id,
    recipient: record.recipient,
    recipientLabel: record.recipientLabel,
    amountSol: record.amountSol,
    network: "devnet",
    estimatedFeeSol: record.estimatedFeeSol,
    status,
    signature: record.signature,
    explorerUrl: record.signature ? explorerTx(record.signature) : undefined,
    error: record.error,
  };
}

function assertTransferId(id: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new HttpError(400, "Invalid transfer id.");
  }
}
