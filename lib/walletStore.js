import crypto from "crypto";
import { kv } from "@vercel/kv";

const MASTER_KEY = process.env.MASTER_KEY;
const PREFIX = "bms:aiwallet:v1:";

function key32() {
  if (!MASTER_KEY) throw new Error("MASTER_KEY missing");
  return crypto.createHash("sha256").update(MASTER_KEY).digest();
}

export function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key32(), iv);
  const enc = Buffer.concat([
    cipher.update(JSON.stringify(obj)),
    cipher.final(),
  ]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: enc.toString("base64"),
  };
}

export function decrypt(payload) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key32(),
    Buffer.from(payload.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(dec.toString());
}

export async function loadWallet(userId) {
  return kv.get(PREFIX + userId);
}

export async function saveWallet(userId, payload) {
  return kv.set(PREFIX + userId, payload);
}
