export const config = { runtime: "nodejs" };

import { Wallet } from "ethers";
import { encrypt, decrypt, loadWallet, saveWallet } from "../lib/walletStore";
import { requireVerifiedUser } from "../lib/utils";

const logError = (msg, err) => {
  console.error(`[WalletAPI] ${msg}:`, err?.message || err);
};

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

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (globalErr) {
    logError("Global handler error", globalErr);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
}
