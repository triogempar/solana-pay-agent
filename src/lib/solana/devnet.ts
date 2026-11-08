/** Official Solana cluster genesis hashes. Signing is allowed only for devnet. */
export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const TESTNET_GENESIS = "4uhcVJyU9pJkvQyS88uRDiswHXSWxYmacFdAuP8KYyA";
export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

export function assertDevnetGenesis(hash: string): void {
  if (hash !== DEVNET_GENESIS) {
    throw new Error(
      `Refusing to sign: RPC genesis hash is not Solana devnet (got ${hash.slice(0, 12)}…).`,
    );
  }
}

export function assertRpcUrlAllowed(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("SOLANA_RPC_URL must be a valid http(s) URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("SOLANA_RPC_URL must be an http(s) URL.");
  }
  const haystack = url.toLowerCase();
  if (haystack.includes("mainnet") || haystack.includes("testnet")) {
    throw new Error("SOLANA_RPC_URL must point at devnet. Mainnet and testnet are disabled.");
  }
}
