import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Keypair } from "@solana/web3.js";

export type KeypairSource = "env" | "file" | "generated";

export class KeypairNotConfigured extends Error {
  constructor() {
    super("NO_KEYPAIR");
    this.name = "KeypairNotConfigured";
  }
}

export function loadAgentKeypair(options: {
  secretKey?: string;
  keypairPath?: string;
  persistPath: string;
  allowGenerate?: boolean;
}): { keypair: Keypair; source: KeypairSource } {
  const secret = options.secretKey?.trim();
  if (secret) {
    return { keypair: keypairFromJson(secret, "AGENT_SECRET_KEY"), source: "env" };
  }

  if (options.keypairPath?.trim()) {
    const file = resolvePath(options.keypairPath.trim());
    if (!existsSync(file)) {
      throw new Error(`AGENT_KEYPAIR_PATH does not exist: ${file}`);
    }
    return { keypair: keypairFromJson(readFileSync(file, "utf8"), file), source: "file" };
  }

  const persist = resolvePath(options.persistPath);
  if (existsSync(persist)) {
    return { keypair: keypairFromJson(readFileSync(persist, "utf8"), persist), source: "file" };
  }

  if (!options.allowGenerate) throw new KeypairNotConfigured();

  const keypair = Keypair.generate();
  mkdirSync(path.dirname(persist), { recursive: true });
  writeFileSync(persist, JSON.stringify(Array.from(keypair.secretKey)), { mode: 0o600 });
  return { keypair, source: "generated" };
}

function resolvePath(file: string): string {
  return path.isAbsolute(file) ? file : path.join(process.cwd(), file);
}

function keypairFromJson(raw: string, label: string): Keypair {
  const text = raw.trim();
  if (!text.startsWith("[")) {
    throw new Error(`${label} must be a JSON array of 64 bytes. Use AGENT_KEYPAIR_PATH for a file.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
  if (!Array.isArray(parsed) || !parsed.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    throw new Error(`${label} must be a JSON array of byte values.`);
  }
  if (parsed.length !== 64) {
    throw new Error(
      `${label} must contain 64 bytes (the Solana secret key). Got ${parsed.length}. A 32-byte seed is not accepted.`,
    );
  }
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
}
