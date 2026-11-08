export const FAUCET_URL = "https://faucet.solana.com";
export const LAMPORTS_PER_SOL = 1_000_000_000n;

export function shortAddress(address: string, head = 4, tail = 4): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export function formatSol(lamports: bigint): string {
  const negative = lamports < 0n;
  const value = negative ? -lamports : lamports;
  const whole = value / LAMPORTS_PER_SOL;
  const fraction = (value % LAMPORTS_PER_SOL).toString().padStart(9, "0").replace(/0+$/, "");
  const body = fraction ? `${whole.toString()}.${fraction}` : whole.toString();
  return negative ? `-${body}` : body;
}

export function formatSolRounded(lamports: bigint, places = 4): string {
  const negative = lamports < 0n;
  const abs = negative ? -lamports : lamports;
  const base = 10n ** BigInt(9 - places);
  const rounded = (abs + base / 2n) / base;
  const scale = 10n ** BigInt(places);
  const whole = rounded / scale;
  const fraction = (rounded % scale).toString().padStart(places, "0").replace(/0+$/, "");
  const body = fraction ? `${whole.toString()}.${fraction}` : whole.toString();
  return negative ? `-${body}` : body;
}

/** Header balance: 4 decimal places, but never round a tiny non-zero balance down to 0. */
export function formatSolHeader(lamports: bigint): string {
  if (lamports === 0n) return "0";
  const rounded = formatSolRounded(lamports, 4);
  if (rounded === "0" || rounded === "-0") return formatSol(lamports);
  return rounded;
}

export function formatTime(unixSeconds: number | null): string {
  if (!unixSeconds) return "—";
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function explorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function explorerAddress(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

export function lamportsToNumber(lamports: bigint): number {
  if (lamports > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Amount is too large to encode safely.");
  }
  return Number(lamports);
}
