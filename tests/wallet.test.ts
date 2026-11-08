import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { KeypairNotConfigured, loadAgentKeypair } from "../src/lib/solana/wallet";

describe("loadAgentKeypair", () => {
  it("loads a 64-byte JSON secret and ignores a missing file", () => {
    const keypair = Keypair.generate();
    const loaded = loadAgentKeypair({
      secretKey: JSON.stringify(Array.from(keypair.secretKey)),
      persistPath: path.join(tmpdir(), "does-not-need-to-exist.json"),
    });
    expect(loaded.source).toBe("env");
    expect(loaded.keypair.publicKey.equals(keypair.publicKey)).toBe(true);
  });

  it("rejects a 32-byte seed", () => {
    const seed = Array.from(Keypair.generate().secretKey).slice(0, 32);
    expect(() =>
      loadAgentKeypair({
        secretKey: JSON.stringify(seed),
        persistPath: path.join(tmpdir(), "unused.json"),
      }),
    ).toThrow(/64/);
  });

  it("generates once and reloads the same file without the secret in the env", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "agent-key-"));
    const persistPath = path.join(dir, "agent-keypair.json");
    const created = loadAgentKeypair({ persistPath, allowGenerate: true });
    expect(created.source).toBe("generated");
    const again = loadAgentKeypair({ persistPath, allowGenerate: false });
    expect(again.source).toBe("file");
    expect(again.keypair.publicKey.equals(created.keypair.publicKey)).toBe(true);
  });

  it("skips generation when no key is configured", () => {
    const persistPath = path.join(mkdtempSync(path.join(tmpdir(), "agent-key-")), "missing.json");
    expect(() => loadAgentKeypair({ persistPath, allowGenerate: false })).toThrow(KeypairNotConfigured);
  });
});
