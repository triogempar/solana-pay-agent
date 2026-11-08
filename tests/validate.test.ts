import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { formatSol, formatSolHeader } from "../src/lib/format";
import { detectLocale } from "../src/lib/locale";
import { assertWithinCap, parseSolAmount } from "../src/lib/solana/amount";
import { DEVNET_GENESIS, MAINNET_GENESIS, assertDevnetGenesis, assertRpcUrlAllowed } from "../src/lib/solana/devnet";
import { summarizeParsedTransaction } from "../src/lib/solana/explain";
import { assertContactName, assertValidAddress, tryPublicKey } from "../src/lib/solana/validate";

const SAMPLE = "BQiS4hUHAChFwMqecbWbqwmi5LCwsSG8JMgrq1PpVyHA";

describe("addresses", () => {
  it("accepts a canonical public key and the demo contact address", () => {
    const key = Keypair.generate().publicKey.toBase58();
    expect(assertValidAddress(key)).toBe(key);
    expect(tryPublicKey(SAMPLE)?.toBase58()).toBe(SAMPLE);
  });

  it("rejects junk and trims a valid address", () => {
    const key = Keypair.generate().publicKey.toBase58();
    expect(tryPublicKey("not-an-address")).toBeNull();
    expect(tryPublicKey("")).toBeNull();
    expect(tryPublicKey("0OIl")).toBeNull();
    expect(() => assertValidAddress("hello")).toThrow(/Solana address/);
    expect(assertValidAddress(`  ${key}  `)).toBe(key);
  });

  it("validates contact names", () => {
    expect(assertContactName("  Budi  ")).toBe("Budi");
    expect(assertContactName("Warung Bu Ani")).toBe("Warung Bu Ani");
    expect(() => assertContactName("1bad")).toThrow(/letter/);
    expect(() => assertContactName("")).toThrow(/letter/);
  });
});

describe("amounts and spending cap", () => {
  const cap = parseSolAmount("1");

  it("parses SOL, comma decimals, and a trailing unit", () => {
    expect(parseSolAmount(0.1)).toBe(100_000_000n);
    expect(parseSolAmount("0.1")).toBe(100_000_000n);
    expect(parseSolAmount("0,1 SOL")).toBe(100_000_000n);
    expect(parseSolAmount("1")).toBe(1_000_000_000n);
    expect(parseSolAmount("0.000000001")).toBe(1n);
  });

  it("rejects zero, negatives, junk, and more than 9 decimals", () => {
    expect(() => parseSolAmount(0)).toThrow(/greater than 0/);
    expect(() => parseSolAmount(-0.2)).toThrow(/greater than 0/);
    expect(() => parseSolAmount("1.0000000001")).toThrow(/9 decimal/);
    expect(() => parseSolAmount("lots")).toThrow(/positive SOL/);
    expect(() => parseSolAmount(Number.NaN)).toThrow(/finite/);
  });

  it("allows the cap and rejects one lamport over it", () => {
    expect(() => assertWithinCap(cap, cap, "1")).not.toThrow();
    expect(() => assertWithinCap(cap + 1n, cap, "1")).toThrow(/1 SOL per-transfer cap/);
  });

  it("formats lamports without binary float dust", () => {
    expect(formatSol(100_000_000n)).toBe("0.1");
    expect(formatSol(5_000n)).toBe("0.000005");
    expect(formatSol(0n)).toBe("0");
    expect(formatSolHeader(5_000n)).toBe("0.000005");
    expect(formatSolHeader(1_234_560_000n)).toBe("1.2346");
  });
});

describe("devnet lock", () => {
  it("accepts the devnet genesis and rejects mainnet", () => {
    expect(() => assertDevnetGenesis(DEVNET_GENESIS)).not.toThrow();
    expect(() => assertDevnetGenesis(MAINNET_GENESIS)).toThrow(/not Solana devnet/);
  });

  it("rejects mainnet and testnet RPC URLs", () => {
    expect(() => assertRpcUrlAllowed("https://api.devnet.solana.com")).not.toThrow();
    expect(() => assertRpcUrlAllowed("https://api.mainnet-beta.solana.com")).toThrow(/devnet/);
    expect(() => assertRpcUrlAllowed("https://api.testnet.solana.com")).toThrow(/devnet/);
  });
});

describe("transaction explanation", () => {
  it("summarizes a parsed SOL transfer", () => {
    const view = summarizeParsedTransaction("sig", {
      slot: 10,
      blockTime: 1_700_000_000,
      meta: { fee: 5000, err: null },
      transaction: {
        message: {
          instructions: [
            {
              parsed: {
                type: "transfer",
                info: { source: "From111", destination: "To222", lamports: 100_000_000 },
              },
            },
          ],
        },
      },
    });
    expect(view?.status).toBe("success");
    expect(view?.feeSol).toBe("0.000005");
    expect(view?.transfers[0]).toMatchObject({ sol: "0.1", from: "From111", to: "To222" });
    expect(view?.summary).toContain("0.1 SOL");
    expect(view?.explorerUrl).toContain("cluster=devnet");
  });

  it("returns null when the transaction is missing", () => {
    expect(summarizeParsedTransaction("sig", null)).toBeNull();
  });
});

describe("locale", () => {
  it("detects Indonesian and defaults to English", () => {
    expect(detectLocale("Berapa saldo saya?")).toBe("id");
    expect(detectLocale("kirim 0.1 SOL ke Budi")).toBe("id");
    expect(detectLocale("What's my balance?")).toBe("en");
  });
});
