import { explorerTx, formatSol } from "../format";
import type { ExplanationView } from "../types";

type ParsedInfo = {
  source?: string;
  destination?: string;
  lamports?: number;
};

type ParsedInstruction = {
  parsed?: {
    type?: string;
    info?: ParsedInfo;
  };
};

export type ParsedTxLike = {
  slot?: number;
  blockTime?: number | null;
  meta?: {
    fee?: number;
    err?: unknown;
    innerInstructions?: { instructions?: ParsedInstruction[] }[];
  } | null;
  transaction?: {
    message?: {
      instructions?: ParsedInstruction[];
    };
  };
};

export function summarizeParsedTransaction(
  signature: string,
  tx: ParsedTxLike | null,
): ExplanationView | null {
  if (!tx) return null;
  const failed = Boolean(tx.meta?.err);
  const feeLamports = BigInt(tx.meta?.fee ?? 0);
  const transfers = collectTransfers(tx).map((item) => ({
    from: item.from,
    to: item.to,
    sol: formatSol(item.lamports),
  }));
  const feeSol = formatSol(feeLamports);
  const status = failed ? "failed" : "success";
  return {
    signature,
    status,
    feeSol,
    summary: buildSummary(status, feeSol, transfers),
    explorerUrl: explorerTx(signature),
    transfers,
    blockTime: tx.blockTime ?? null,
  };
}

function collectTransfers(tx: ParsedTxLike): { from: string; to: string; lamports: bigint }[] {
  const instructions: ParsedInstruction[] = [
    ...(tx.transaction?.message?.instructions ?? []),
    ...(tx.meta?.innerInstructions ?? []).flatMap((inner) => inner.instructions ?? []),
  ];
  const transfers: { from: string; to: string; lamports: bigint }[] = [];
  for (const instruction of instructions) {
    const parsed = instruction.parsed;
    if (!parsed || parsed.type !== "transfer" || !parsed.info) continue;
    const { source, destination, lamports } = parsed.info;
    if (!source || !destination || typeof lamports !== "number") continue;
    transfers.push({ from: source, to: destination, lamports: BigInt(lamports) });
  }
  return transfers;
}

function buildSummary(
  status: "success" | "failed",
  feeSol: string,
  transfers: { from: string; to: string; sol: string }[],
): string {
  const outcome = status === "success" ? "succeeded" : "failed";
  if (transfers.length === 0) {
    return `This transaction ${outcome}. The network fee was ${feeSol} SOL. No SOL transfer instruction was found.`;
  }
  const moved = transfers
    .map((item) => `${item.sol} SOL from ${item.from} to ${item.to}`)
    .join("; ");
  return `This transaction ${outcome}. It moved ${moved}. The network fee was ${feeSol} SOL.`;
}
