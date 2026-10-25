const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Encrypts secrets at rest (upstream credentials) with AES-256-GCM, keyed from WRIT_SECRET.
 * Changing WRIT_SECRET makes stored secrets unreadable; re-enter them after rotating it.
 */
export class Secrets {
  private constructor(private readonly key: CryptoKey) {}

  static async fromSecret(secret: string): Promise<Secrets> {
    if (secret.length < 32) throw new Error("WRIT_SECRET must be at least 32 characters");
    const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, [
      "deriveKey",
    ]);
    const key = await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: encoder.encode("writ/secrets/v1"),
        info: new Uint8Array(),
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    return new Secrets(key);
  }

  async seal(plaintext: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      this.key,
      encoder.encode(plaintext),
    );
    return `v1.${Buffer.from(iv).toString("base64url")}.${Buffer.from(ct).toString("base64url")}`;
  }

  async open(sealed: string): Promise<string> {
    const [version, iv, ct] = sealed.split(".");
    if (version !== "v1" || !iv || !ct) throw new Error("unrecognised secret format");
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Buffer.from(iv, "base64url") },
      this.key,
      Buffer.from(ct, "base64url"),
    );
    return decoder.decode(pt);
  }
}
