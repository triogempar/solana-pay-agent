import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { explorerTx, formatSol, lamportsToNumber } from "../format";
import type { TxListItem } from "../types";
import { assertDevnetGenesis } from "./devnet";
import { summarizeParsedTransaction, type ParsedTxLike } from "./explain";
import type { ExplanationView } from "../types";

const DEFAULT_FEE = 5_000n;

export interface SolanaGateway {
  getPublicKey(): PublicKey;
  getBalance(): Promise<bigint>;
  estimateFee(to: PublicKey, lamports: bigint): Promise<bigint>;
  getRecentTransactions(limit: number): Promise<TxListItem[]>;
  explainTransaction(signature: string): Promise<ExplanationView | null>;
  sendSol(to: PublicKey, lamports: bigint): Promise<string>;
  assertDevnet(): Promise<void>;
}

export function createSolanaGateway(connection: Connection, payer: Keypair): SolanaGateway {
  return {
    getPublicKey() {
      return payer.publicKey;
    },
    async getBalance() {
      const lamports = await connection.getBalance(payer.publicKey, "confirmed");
      return BigInt(lamports);
    },
    async estimateFee(to, lamports) {
      try {
        const { blockhash } = await connection.getLatestBlockhash("confirmed");
        const tx = new Transaction({ recentBlockhash: blockhash, feePayer: payer.publicKey }).add(
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: to,
            lamports: lamportsToNumber(lamports),
          }),
        );
        const fee = await connection.getFeeForMessage(tx.compileMessage(), "confirmed");
        if (fee.value === null) return DEFAULT_FEE;
        return BigInt(fee.value);
      } catch {
        return DEFAULT_FEE;
      }
    },
    async getRecentTransactions(limit) {
      const signatures = await connection.getSignaturesForAddress(payer.publicKey, { limit }, "confirmed");
      return signatures.map((item) => ({
        signature: item.signature,
        slot: item.slot,
        blockTime: item.blockTime ?? null,
        err: Boolean(item.err),
        explorerUrl: explorerTx(item.signature),
      }));
    },
    async explainTransaction(signature) {
      const tx = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      return summarizeParsedTransaction(signature, tx as ParsedTxLike | null);
    },
    async sendSol(to, lamports) {
      await this.assertDevnet();
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: to,
          lamports: lamportsToNumber(lamports),
        }),
      );
      return sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
    },
    async assertDevnet() {
      const hash = await connection.getGenesisHash();
      assertDevnetGenesis(hash);
    },
  };
}

export function insufficientBalanceMessage(have: bigint, need: bigint): string {
  return `Insufficient balance: the wallet has ${formatSol(have)} SOL and this transfer needs ${formatSol(need)} SOL including the fee.`;
}
