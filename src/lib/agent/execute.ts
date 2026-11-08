import { PublicKey } from "@solana/web3.js";
import type { ContactStore } from "../contacts/store";
import { explorerTx, formatSol } from "../format";
import type { Artifact, TransferRecord } from "../types";
import { assertWithinCap, parseSolAmount } from "../solana/amount";
import { insufficientBalanceMessage, type SolanaGateway } from "../solana/gateway";
import {
  assertContactName,
  assertSignature,
  assertValidAddress,
  clampLimit,
  tryPublicKey,
} from "../solana/validate";
import type { TransferStore } from "../transfers/store";
import type { ToolExecution } from "./run";

export function createToolExecutor(deps: {
  gateway: SolanaGateway;
  contacts: ContactStore;
  transfers: TransferStore;
  maxLamports: bigint;
  maxSolLabel: string;
}): (name: string, args: Record<string, unknown>) => Promise<ToolExecution> {
  return async (name, args) => {
    try {
      switch (name) {
        case "get_balance":
          return await getBalance(deps.gateway);
        case "send_sol":
          return await prepareSend(deps, args);
        case "get_recent_transactions":
          return await recent(deps.gateway, args);
        case "save_contact":
          return await saveContact(deps, args);
        case "list_contacts":
          return await listContacts(deps.contacts);
        case "explain_transaction":
          return await explain(deps.gateway, args);
        default:
          return { output: { error: `Unknown tool: ${name}` } };
      }
    } catch (err) {
      return { output: { error: err instanceof Error ? err.message : "Tool failed." } };
    }
  };
}

async function getBalance(gateway: SolanaGateway): Promise<ToolExecution> {
  const lamports = await gateway.getBalance();
  const address = gateway.getPublicKey().toBase58();
  const balanceSol = formatSol(lamports);
  return {
    output: {
      address,
      balanceSol,
      balanceLamports: lamports.toString(),
      network: "devnet",
    },
    artifacts: [{ type: "balance", address, balanceSol, network: "devnet" }],
  };
}

async function prepareSend(
  deps: {
    gateway: SolanaGateway;
    contacts: ContactStore;
    transfers: TransferStore;
    maxLamports: bigint;
    maxSolLabel: string;
  },
  args: Record<string, unknown>,
): Promise<ToolExecution> {
  const amount = parseSolAmount(pick(args, ["amount", "sol", "value"]));
  assertWithinCap(amount, deps.maxLamports, deps.maxSolLabel);
  const recipientRaw = stringPick(args, ["recipient", "to", "address", "contact"]);
  if (!recipientRaw) {
    throw new Error("Who should receive the SOL? Give an address or a saved contact name.");
  }
  const resolved = await resolveRecipient(recipientRaw, deps.contacts);
  await deps.gateway.assertDevnet();
  const balance = await deps.gateway.getBalance();
  const destination = new PublicKey(resolved.address);
  const fee = await deps.gateway.estimateFee(destination, amount);
  if (balance < amount + fee) {
    throw new Error(insufficientBalanceMessage(balance, amount + fee));
  }

  const now = new Date().toISOString();
  const record: TransferRecord = {
    id: crypto.randomUUID(),
    recipient: resolved.address,
    recipientLabel: resolved.label,
    lamports: amount.toString(),
    amountSol: formatSol(amount),
    network: "devnet",
    estimatedFeeLamports: fee.toString(),
    estimatedFeeSol: formatSol(fee),
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  await deps.transfers.create(record);
  const transfer = {
    id: record.id,
    recipient: record.recipient,
    recipientLabel: record.recipientLabel,
    amountSol: record.amountSol,
    network: "devnet" as const,
    estimatedFeeSol: record.estimatedFeeSol,
    status: "pending" as const,
  };
  return {
    output: {
      status: "awaiting_approval",
      transferId: record.id,
      recipient: record.recipient,
      recipientLabel: record.recipientLabel ?? null,
      amountSol: record.amountSol,
      network: "devnet",
      estimatedFeeSol: record.estimatedFeeSol,
      message:
        "Transfer prepared but NOT sent. The user must press Approve on the confirmation card. Do not claim the SOL was sent.",
    },
    artifacts: [{ type: "transfer", transfer }],
  };
}

async function recent(gateway: SolanaGateway, args: Record<string, unknown>): Promise<ToolExecution> {
  const limit = clampLimit(pick(args, ["limit", "count", "n"]), 5);
  const items = await gateway.getRecentTransactions(limit);
  return {
    output: { transactions: items },
    artifacts: [{ type: "transactions", items }],
  };
}

async function saveContact(
  deps: { contacts: ContactStore },
  args: Record<string, unknown>,
): Promise<ToolExecution> {
  const name = assertContactName(stringPick(args, ["name", "contact"]) ?? "");
  const address = assertValidAddress(stringPick(args, ["address", "pubkey", "recipient"]) ?? "");
  const saved = await deps.contacts.save(name, address);
  return {
    output: { saved },
    artifacts: [{ type: "contact_saved", name: saved.name, address: saved.address }],
  };
}

async function listContacts(contacts: ContactStore): Promise<ToolExecution> {
  const all = await contacts.list();
  return { output: { contacts: all } };
}

async function explain(gateway: SolanaGateway, args: Record<string, unknown>): Promise<ToolExecution> {
  const signature = assertSignature(stringPick(args, ["signature", "sig", "tx", "transaction"]) ?? "");
  const explanation = await gateway.explainTransaction(signature);
  if (!explanation) {
    return {
      output: {
        found: false,
        signature,
        error: "No confirmed transaction found for that signature on devnet.",
      },
    };
  }
  return {
    output: { found: true, ...explanation, explorerUrl: explanation.explorerUrl || explorerTx(signature) },
    artifacts: [{ type: "explanation", explanation }],
  };
}

export async function resolveRecipient(
  input: string,
  contacts: ContactStore,
): Promise<{ address: string; label?: string }> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Who should receive the SOL? Give an address or a saved contact name.");
  }
  const asKey = tryPublicKey(trimmed);
  if (asKey) {
    const address = asKey.toBase58();
    const match = (await contacts.list()).find((contact) => contact.address === address);
    return { address, label: match?.name };
  }
  const contact = await contacts.find(trimmed);
  if (!contact) {
    throw new Error(
      `No saved contact named "${trimmed}". Save the address first, or paste a Solana address.`,
    );
  }
  return { address: contact.address, label: contact.name };
}

function pick(args: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = args[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function stringPick(args: Record<string, unknown>, keys: string[]): string | null {
  const value = pick(args, keys);
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}
