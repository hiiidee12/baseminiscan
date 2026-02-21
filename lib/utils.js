import { Wallet } from "ethers";

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
