const PREFIX = "writ_";

/** A new agent token: shown once, stored only as a hash. */
export function newToken(): { token: string; hash: string; hint: string } {
  const token = `${PREFIX}${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")}`;
  return { token, hash: hashToken(token), hint: token.slice(0, PREFIX.length + 4) };
}

export function hashToken(token: string): string {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}

/** The bearer token from an Authorization header, if it looks like a Writ token. */
export function bearer(header: string | undefined): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1]?.startsWith(PREFIX) ? match[1] : null;
}
