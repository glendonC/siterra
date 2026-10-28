import { randomBytes } from "node:crypto";

const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** ULID: 48-bit millisecond time and 80 random bits in Crockford base 32 (26 characters). */
export function ulid(now: number = Date.now()): string {
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i += 1) {
    time = crockford.charAt(t % 32) + time;
    t = Math.floor(t / 32);
  }
  const bytes = randomBytes(16);
  let random = "";
  for (let i = 0; i < 16; i += 1) {
    random += crockford.charAt(bytes.readUInt8(i) % 32);
  }
  return time + random;
}

/** Server-generated record ID: the type prefix and a ULID (data-contracts.md, identifiers). */
export function newId(prefix: string, now?: number): string {
  return `${prefix}_${ulid(now)}`;
}
