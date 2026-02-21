import crypto from "crypto";
import { Wallet } from "ethers";

function __readMasterKey() {
  const raw = process.env.MASTER_KEY;
  if (!raw) throw new Error("Missing MASTER_KEY");

  const s = String(raw).trim();

  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, "hex");

  try {
    const b = Buffer.from(s, "base64");
    if (b.length === 32) return b;
  } catch {}

  const u = Buffer.from(s, "utf8");
  if (u.length === 32) return u;

  throw new Error("Invalid MASTER_KEY");
}

export function isValidAddress(addr) {
  const a = String(addr || "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(a);
}

export function normalizePrivateKey(pk) {
  const s = String(pk || "").trim();
  if (!s) return null;
  const x = s.startsWith("0x") ? s.slice(2) : s;
  if (!/^[0-9a-fA-F]{64}$/.test(x)) return null;
  return "0x" + x.toLowerCase();
}

export function isValidPrivateKey(pk) {
  return Boolean(normalizePrivateKey(pk));
}

export function privateKeyToAddress(pk) {
  const n = normalizePrivateKey(pk);
  if (!n) return null;
  try {
    const w = new Wallet(n);
    return String(w.address).toLowerCase();
  } catch {
    return null;
  }
}

export function seal(plainText) {
  const key = __readMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const pt = Buffer.from(String(plainText || ""), "utf8");
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function unseal(payload) {
  const key = __readMasterKey();
  const s = String(payload || "");

  const m = s.match(/^v1:([^:]+):([^:]+):(.+)$/);
  if (!m) throw new Error("Invalid sealed payload");

  const iv = Buffer.from(m[1], "base64");
  const tag = Buffer.from(m[2], "base64");
  const ct = Buffer.from(m[3], "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

export function requireVerifiedUser(context, userIdInput) {
  const ctx = context && typeof context === "object" ? context : {};
  const fid = ctx.fid != null ? String(ctx.fid) : null;
  const verified = ctx.__verifiedUser === true && Boolean(fid);

  const userId =
    (userIdInput && String(userIdInput).trim()) ||
    (fid ? `fc:${fid}` : null) ||
    (ctx.address ? `addr:${String(ctx.address).toLowerCase()}` : null) ||
    null;

  if (!verified) {
    const err = new Error("User not verified");
    err.statusCode = 401;
    throw err;
  }

  return {
    ok: true,
    userId,
    fid,
    username: ctx.farcasterUsername != null ? String(ctx.farcasterUsername) : null,
    verified: true,
  };
}
