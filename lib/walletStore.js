import crypto from "crypto";
import { kv } from "@vercel/kv";

const MASTER_KEY = process.env.MASTER_KEY || "";
const KEY_PREFIX = "bms:aiwallet:v1:";

function masterKey32() {
  if (!MASTER_KEY) throw new Error("MASTER_KEY missing");
  return crypto.createHash("sha256").update(MASTER_KEY).digest();
}

export function encryptObj(obj) {
  const key = masterKey32();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const pt = Buffer.from(JSON.stringify(obj), "utf8");
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ct.toString("base64"),
  };
}

export function decryptObj(payload) {
  const key = masterKey32();
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const ct = Buffer.from(payload.ct, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString("utf8"));
}

function k(userId) {
  return `${KEY_PREFIX}${String(userId)}`;
}

export async function getEncryptedWalletPayload(userId) {
  return (await kv.get(k(userId))) || null;
}

export async function setEncryptedWalletPayload(userId, payload) {
  await kv.set(k(userId), payload);
}
