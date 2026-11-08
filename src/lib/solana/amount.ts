import { LAMPORTS_PER_SOL } from "../format";

export class AmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmountError";
  }
}

/**
 * Parse a SOL amount into lamports.
 * Accepts numbers, decimal strings, Indonesian comma decimals, and a trailing "SOL".
 * Rejects more than 9 decimal places, zero, negatives, and non-finite values.
 */
export function parseSolAmount(input: unknown): bigint {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new AmountError("Amount must be a finite number of SOL.");
    if (input <= 0) throw new AmountError("Amount must be greater than 0.");
    const [whole, fraction = ""] = input.toFixed(9).split(".");
    const trimmed = fraction.replace(/0+$/, "");
    return parseSolString(trimmed ? `${whole}.${trimmed}` : whole);
  }
  if (typeof input === "string") {
    return parseSolString(normalizeAmountText(input));
  }
  throw new AmountError("Amount must be a number of SOL.");
}

export function assertWithinCap(lamports: bigint, maxLamports: bigint, maxSolLabel: string): void {
  if (lamports <= 0n) throw new AmountError("Amount must be greater than 0.");
  if (lamports > maxLamports) {
    throw new AmountError(
      `Amount exceeds the ${maxSolLabel} SOL per-transfer cap. Ask for a smaller amount.`,
    );
  }
}

function normalizeAmountText(input: string): string {
  let text = input.trim();
  const match = text.match(/^([0-9]+(?:[.,][0-9]+)?)\s*(?:sol)?$/i);
  if (!match) return text;
  text = match[1].replace(",", ".");
  return text;
}

function parseSolString(input: string): bigint {
  const text = input.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new AmountError("Amount must be a positive SOL value, for example 0.1.");
  }
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > 9) {
    throw new AmountError("Amount has more than 9 decimal places. SOL only goes to lamports.");
  }
  const padded = (fraction + "000000000").slice(0, 9);
  const lamports = BigInt(whole) * LAMPORTS_PER_SOL + BigInt(padded);
  if (lamports <= 0n) throw new AmountError("Amount must be greater than 0.");
  return lamports;
}
