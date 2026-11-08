import { PublicKey } from "@solana/web3.js";

export function tryPublicKey(value: string): PublicKey | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const key = new PublicKey(trimmed);
    if (key.toBase58() !== trimmed) return null;
    return key;
  } catch {
    return null;
  }
}

export function assertValidAddress(value: string): string {
  const key = tryPublicKey(value);
  if (!key) throw new Error("That doesn't look like a Solana address.");
  return key.toBase58();
}

export function assertContactName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!/^[A-Za-z][A-Za-z0-9 _-]{0,31}$/.test(normalized)) {
    throw new Error(
      "Contact names must start with a letter and be at most 32 characters (letters, numbers, spaces, _ or -).",
    );
  }
  return normalized;
}

export function assertSignature(signature: string): string {
  const trimmed = signature.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,128}$/.test(trimmed)) {
    throw new Error("That doesn't look like a transaction signature.");
  }
  return trimmed;
}

export function clampLimit(value: unknown, fallback = 5): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(10, Math.max(1, Math.floor(parsed)));
}
