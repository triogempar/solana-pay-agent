import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createMutex } from "../mutex";
import type { TransferRecord, TransferStatus } from "../types";
import { applyTransition, pruneTransfers } from "./state";

export interface TransferStore {
  create(record: TransferRecord): Promise<TransferRecord>;
  get(id: string): Promise<TransferRecord | null>;
  transition(
    id: string,
    from: TransferStatus[],
    patch: Partial<TransferRecord>,
  ): Promise<TransferRecord | null>;
}

export function createTransferStore(filePath?: string): TransferStore {
  const lock = createMutex();
  let records: TransferRecord[] | null = filePath ? null : [];

  async function read(): Promise<TransferRecord[]> {
    if (!filePath) return records ?? [];
    if (records) return records;
    const absolute = resolve(filePath);
    if (!existsSync(absolute)) {
      records = [];
      return records;
    }
    const parsed = JSON.parse(readFileSync(absolute, "utf8")) as { transfers?: TransferRecord[] };
    records = Array.isArray(parsed.transfers) ? parsed.transfers : [];
    return records;
  }

  async function write(next: TransferRecord[]): Promise<void> {
    records = next;
    if (!filePath) return;
    const absolute = resolve(filePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, JSON.stringify({ transfers: next }, null, 2), { mode: 0o600 });
  }

  return {
    async create(record) {
      return lock(async () => {
        const all = await read();
        const next = pruneTransfers([...all, record]);
        await write(next);
        return record;
      });
    },
    async get(id) {
      return lock(async () => {
        const all = await read();
        return all.find((record) => record.id === id) ?? null;
      });
    },
    async transition(id, from, patch) {
      return lock(async () => {
        const all = await read();
        const result = applyTransition(all, id, from, patch, new Date().toISOString());
        if (!result.updated) return null;
        await write(result.records);
        return result.updated;
      });
    },
  };
}

function resolve(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}
