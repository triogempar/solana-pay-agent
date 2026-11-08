import type { TransferRecord, TransferStatus } from "../types";

export function applyTransition(
  records: TransferRecord[],
  id: string,
  from: TransferStatus[],
  patch: Partial<TransferRecord>,
  now: string,
): { records: TransferRecord[]; updated: TransferRecord | null } {
  const index = records.findIndex((record) => record.id === id);
  if (index < 0) return { records, updated: null };
  const current = records[index];
  if (!from.includes(current.status)) return { records, updated: null };
  const updated: TransferRecord = {
    ...current,
    ...patch,
    id: current.id,
    updatedAt: now,
  };
  const next = records.slice();
  next[index] = updated;
  return { records: next, updated };
}

export function pruneTransfers(records: TransferRecord[], max = 100): TransferRecord[] {
  if (records.length <= max) return records;
  const keep = new Set<string>();
  for (const record of records) {
    if (record.status === "pending" || record.status === "submitting") keep.add(record.id);
  }
  const rest = records.filter((record) => !keep.has(record.id));
  const room = Math.max(0, max - keep.size);
  const trimmed = rest.slice(-room);
  const ids = new Set([...keep, ...trimmed.map((record) => record.id)]);
  return records.filter((record) => ids.has(record.id));
}
