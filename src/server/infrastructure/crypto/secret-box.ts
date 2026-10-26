import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SecretBox } from "../../application/ai/ports";

const VERSION = "v1";

/**
 * AES-256-GCM with a random IV per value (ADR 0011). The context is authenticated data,
 * so a ciphertext copied to another user's row fails to open instead of decrypting.
 */
export class AesGcmSecretBox implements SecretBox {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, "base64");
    if (this.key.length !== 32)
      throw new Error("POLARIS_MASTER_KEY must be 32 bytes, base64-encoded");
  }

  seal(plaintext: string, context: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), data]
      .map((p) => (typeof p === "string" ? p : p.toString("base64")))
      .join(".");
  }

  open(sealed: string, context: string): string {
    const [version, iv, tag, data] = sealed.split(".");
    if (version !== VERSION || !iv || !tag || !data) throw new Error("Unrecognised secret format");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64"));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString(
      "utf8",
    );
  }
}

/**
 * The configured master key, or one generated on first start and kept beside the database
 * (owner-only), so a fresh install works without setup. Logs once that it should be moved.
 */
export function resolveMasterKey(configured: string | undefined, keyFile: string): string {
  if (configured) return configured;
  if (existsSync(keyFile)) return readFileSync(keyFile, "utf8").trim();
  mkdirSync(dirname(keyFile), { recursive: true });
  const key = randomBytes(32).toString("base64");
  try {
    // "wx" fails if another process created the file first; use theirs, or keys sealed with
    // ours could never be opened again.
    writeFileSync(keyFile, key, { mode: 0o600, flag: "wx" });
  } catch {
    return readFileSync(keyFile, "utf8").trim();
  }
  chmodSync(keyFile, 0o600);
  console.warn(
    `Generated an encryption key at ${keyFile}. Set POLARIS_MASTER_KEY and delete the file to manage it yourself.`,
  );
  return key;
}
