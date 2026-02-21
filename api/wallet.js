import { encrypt, decrypt, loadWallet, saveWallet } from "../../lib/walletstore";
import {
  requireVerifiedUser,
  isValidPrivateKey,
  privateKeyToAddress,
} from "../../lib/utils";

const logError = (msg, err) => {
  console.error(`[WalletAPI] ${msg}:`, err?.message || err);
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  try {
    const action = String(req.query.action || "").toLowerCase();

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

        const payload = encrypt({ address, privateKey });
        await saveWallet(user.userId, payload);

        return res.status(200).json({ ok: true, address });
      } catch (err) {
        logError("Import process failed", err);
        return res.status(500).json({ ok: false, error: "Internal error" });
      }
    }

    if (action === "me" && req.method === "GET") {
      let context = null;
      if (req.query.context) {
        try {
          const rawContext = decodeURIComponent(req.query.context);
          context = JSON.parse(rawContext);
        } catch (e) {
          return res.status(400).json({ ok: false, error: "Invalid context format" });
        }
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

        const { address } = decrypt(saved);
        return res.status(200).json({ ok: true, hasWallet: true, address });
      } catch (err) {
        logError("Load wallet failed", err);
        return res.status(500).json({ ok: false, error: "Failed to load wallet" });
      }
    }

    if (action === "export" && req.method === "POST") {
      const { context } = req.body || {};

      let user;
      try {
        user = requireVerifiedUser(context);
      } catch (err) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      try {
        const saved = await loadWallet(user.userId);
        if (!saved) {
          return res.status(404).json({ ok: false, error: "Wallet not found" });
        }

        const { privateKey } = decrypt(saved);
        
        return res.status(200).json({ ok: true, privateKey }); 
      } catch (err) {
        logError("Export wallet failed", err);
        return res.status(500).json({ ok: false, error: "Failed to export" });
      }
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });

  } catch (globalErr) {
    logError("Global handler error", globalErr);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
}
