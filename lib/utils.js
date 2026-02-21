import { Wallet } from "ethers";

export function normalizeMnemonic(mnemonic) {
  const s = String(mnemonic || "").trim().replace(/\s+/g, " ");
  if (!s) return null;
  const words = s.split(" ");
  if (words.length < 12) return null;
  return s;
}

export function isValidMnemonic(mnemonic) {
  return Boolean(normalizeMnemonic(mnemonic));
}

export function mnemonicToAddress(mnemonic) {
  const m = normalizeMnemonic(mnemonic);
  if (!m) return null;
  try {
    const w = Wallet.fromPhrase(m);
    return String(w.address).toLowerCase();
  } catch {
    return null;
  }
}

export function isValidPrivateKey(privateKey) {
  const pk = String(privateKey || "").trim();
  if (!pk) return false;
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) return false;
  try {
    new Wallet(pk);
    return true;
  } catch {
    return false;
  }
}

export function privateKeyToAddress(privateKey) {
  const pk = String(privateKey || "").trim();
  if (!isValidPrivateKey(pk)) return null;
  try {
    const w = new Wallet(pk);
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
