import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createMutex } from "../mutex";
import type { Contact } from "../types";

export interface ContactStore {
  list(): Promise<Contact[]>;
  save(name: string, address: string): Promise<Contact>;
  find(name: string): Promise<Contact | null>;
}

export function createContactStore(filePath?: string): ContactStore {
  const lock = createMutex();
  let contacts: Contact[] | null = filePath ? null : [];

  async function read(): Promise<Contact[]> {
    if (!filePath) return contacts ?? [];
    if (contacts) return contacts;
    const absolute = resolve(filePath);
    if (!existsSync(absolute)) {
      contacts = [];
      return contacts;
    }
    const parsed = JSON.parse(readFileSync(absolute, "utf8")) as { contacts?: Contact[] };
    contacts = Array.isArray(parsed.contacts) ? parsed.contacts : [];
    return contacts;
  }

  async function write(next: Contact[]): Promise<void> {
    contacts = next;
    if (!filePath) return;
    const absolute = resolve(filePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, JSON.stringify({ contacts: next }, null, 2), { mode: 0o600 });
  }

  return {
    async list() {
      return lock(async () => {
        const all = await read();
        return [...all].sort((a, b) => a.name.localeCompare(b.name));
      });
    },
    async save(name, address) {
      return lock(async () => {
        const all = await read();
        const key = name.toLowerCase();
        const existing = all.find((item) => item.name.toLowerCase() === key);
        const record: Contact = existing
          ? { ...existing, name, address }
          : { name, address, createdAt: new Date().toISOString() };
        const next = existing
          ? all.map((item) => (item.name.toLowerCase() === key ? record : item))
          : [...all, record];
        await write(next);
        return record;
      });
    },
    async find(name) {
      return lock(async () => {
        const all = await read();
        const key = name.trim().toLowerCase();
        return all.find((item) => item.name.toLowerCase() === key) ?? null;
      });
    },
  };
}

function resolve(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}
