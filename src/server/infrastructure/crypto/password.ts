import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { PasswordHasher } from "../../application/auth/ports";

const KEY_LENGTH = 64;
// OWASP-recommended scrypt cost (N=2^17, r=8, p=1). maxmem must cover 128 * N * r bytes.
const PARAMS = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

function derive(password: string, salt: Buffer, params: typeof PARAMS): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, params, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

/** Stores the cost parameters with each hash so they can be raised without breaking logins. */
export class ScryptHasher implements PasswordHasher {
  constructor(private readonly params = PARAMS) {}

  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await derive(password, salt, this.params);
    const { N, r, p } = this.params;
    return ["scrypt", N, r, p, salt.toString("base64"), key.toString("base64")].join("$");
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [scheme, N, r, p, salt, key] = stored.split("$");
    if (scheme !== "scrypt" || !salt || !key) return false;
    const params = { N: Number(N), r: Number(r), p: Number(p), maxmem: this.params.maxmem };
    const expected = Buffer.from(key, "base64");
    const actual = await derive(password, Buffer.from(salt, "base64"), params);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
