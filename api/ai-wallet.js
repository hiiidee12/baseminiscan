export const config = { runtime: "nodejs" };

import crypto from "crypto";
import { kv } from "@vercel/kv";
import { Wallet } from "ethers";
import { encrypt, decrypt, loadWallet, saveWallet } from "../lib/walletStore";
import {
  requireVerifiedUser,
  isValidPrivateKey,
  privateKeyToAddress,
} from "../lib/utils";

const logError = (msg, err) => {
  console.error(`[WalletAPI] ${msg}:`, err?.message || err);
};

function makeNonce() {
  return crypto.randomBytes(16).toString("hex") + Date.now().toString(36);
}

function parseContextFromQuery(req) {
  if (!req.query.context) return null;
  const rawContext = decodeURIComponent(req.query.context);
  return JSON.parse(rawContext);
}

function safeDecrypt(saved) {
  try {
    return decrypt(saved);
  } catch (e) {
    return null;
  }
}

function deriveAddressFromData(data) {
  if (!data || typeof data !== "object") return null;

  if (typeof data.address === "string" && data.address.trim()) {
    return data.address.trim();
  }

  if (typeof data.mnemonic === "string" && data.mnemonic.trim()) {
    try {
      return Wallet.fromPhrase(data.mnemonic.trim()).address;
    } catch {
      return null;
    }
  }

  if (typeof data.privateKey === "string" && data.privateKey.trim()) {
    try {
      return privateKeyToAddress(data.privateKey.trim());
    } catch {
      return null;
    }
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  try {
    const action = String(req.query.action || "").toLowerCase();

    if (action === "create" && req.method === "POST") {
      const { context } = req.body || {};

      let user;
      try {
        user = requireVerifiedUser(context);
      } catch (err) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      try {
        const saved = await loadWallet(user.userId);

        if (saved) {
          const data = safeDecrypt(saved);
          const address = deriveAddressFromData(data);
          return res.status(200).json({
            ok: true,
            address: address || null,
            created: false,
          });
        }

        const wallet = Wallet.createRandom();

        const payload = encrypt({
          address: wallet.address,
          mnemonic: wallet.mnemonic?.phrase,
          createdAt: Date.now(),
        });

        await saveWallet(user.userId, payload);

        return res.status(200).json({
          ok: true,
          address: wallet.address,
          created: true,
        });
      } catch (err) {
        logError("Create wallet failed", err);
        return res.status(500).json({ ok: false, error: "Failed to create" });
      }
    }

    if (action === "import" && req.method === "POST") {
      const { context, privateKey } = req.body || {};

      let user;
      try {
        user = requireVerifiedUser(context);
      } catch (err) {
        logError("Auth failed on import", err);
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      if (!privateKey || !isValidPrivateKey(privateKey)) {
        return res.status(400).json({ ok: false, error: "Invalid private key" });
      }

      try {
        const address = privateKeyToAddress(privateKey);
        if (!address) throw new Error("Failed to derive address");

        const payload = encrypt({ address, privateKey, importedAt: Date.now() });
        await saveWallet(user.userId, payload);

        return res.status(200).json({ ok: true, address });
      } catch (err) {
        logError("Import process failed", err);
        return res.status(500).json({ ok: false, error: "Internal error" });
      }
    }

    if (action === "me" && req.method === "GET") {
      let context = null;
      try {
        context = parseContextFromQuery(req);
      } catch (e) {
        return res.status(400).json({ ok: false, error: "Invalid context format" });
      }

      let user;
      try {
        user = requireVerifiedUser(context);
      } catch (err) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      try {
        const saved = await loadWallet(user.userId);
        if (!saved) {
          return res.status(200).json({ ok: true, hasWallet: false });
        }

        const data = safeDecrypt(saved);
        const address = deriveAddressFromData(data);

        return res.status(200).json({ ok: true, hasWallet: true, address: address || null });
      } catch (err) {
        logError("Load wallet failed", err);
        return res.status(500).json({ ok: false, error: "Failed to load wallet" });
      }
    }

    if (action === "export_nonce" && req.method === "GET") {
      let context = null;
      try {
        context = parseContextFromQuery(req);
      } catch (e) {
        return res.status(400).json({ ok: false, error: "Invalid context format" });
      }

      let user;
      try {
        user = requireVerifiedUser(context);
      } catch (err) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      try {
        const nonce = makeNonce();
        await kv.set(`bms:wallet:export_nonce:${user.userId}`, nonce, { ex: 60 });
        return res.status(200).json({ ok: true, nonce, ttlSec: 60 });
      } catch (err) {
        logError("Export nonce failed", err);
        return res.status(500).json({ ok: false, error: "Failed to create nonce" });
      }
    }

    if (action === "export" && req.method === "POST") {
      const { context, nonce } = req.body || {};

      let user;
      try {
        user = requireVerifiedUser(context);
      } catch (err) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      try {
        const expected = await kv.get(`bms:wallet:export_nonce:${user.userId}`);
        if (!expected || String(expected) !== String(nonce || "")) {
          return res.status(400).json({ ok: false, error: "Invalid or expired nonce" });
        }

        await kv.del(`bms:wallet:export_nonce:${user.userId}`);

        const saved = await loadWallet(user.userId);
        if (!saved) {
          return res.status(404).json({ ok: false, error: "Wallet not found" });
        }

        const data = safeDecrypt(saved);
        if (!data) {
          return res.status(500).json({ ok: false, error: "Failed to decrypt wallet" });
        }

        const mnemonic =
          typeof data.mnemonic === "string" && data.mnemonic.trim()
            ? data.mnemonic.trim()
            : null;

        if (mnemonic) {
          return res.status(200).json({ ok: true, type: "mnemonic", mnemonic });
        }

        const privateKey =
          typeof data.privateKey === "string" && data.privateKey.trim()
            ? data.privateKey.trim()
            : null;

        if (privateKey) {
          return res.status(200).json({ ok: true, type: "privateKey", privateKey });
        }

        return res.status(404).json({ ok: false, error: "No key stored" });
      } catch (err) {
        logError("Export wallet failed", err);
        return res.status(500).json({ ok: false, error: "Failed to export" });
      }
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (globalErr) {
    logError("Global handler error", globalErr);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
}
