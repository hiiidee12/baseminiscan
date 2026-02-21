// /pages/api/wallet.js
import { encrypt, decrypt, loadWallet, saveWallet } from "@/lib/wallet";
import {
  requireVerifiedUser,
  isValidPrivateKey,
  privateKeyToAddress,
} from "@/lib/utils";

export default async function handler(req, res) {
  try {
    const action = String(req.query.action || "").toLowerCase();

    if (action === "import" && req.method === "POST") {
      const { context, privateKey } = req.body || {};
      const { userId } = requireVerifiedUser(context);

      if (!isValidPrivateKey(privateKey)) {
        return res.status(400).json({ ok: false });
      }

      const address = privateKeyToAddress(privateKey);
      const payload = encrypt({ address, privateKey });

      await saveWallet(userId, payload);

      return res.status(200).json({ ok: true, address });
    }

    if (action === "me" && req.method === "GET") {
      const { context } = req.query || {};
      const { userId } = requireVerifiedUser(
        context ? JSON.parse(context) : null
      );

      const saved = await loadWallet(userId);
      if (!saved) return res.status(200).json({ ok: true, hasWallet: false });

      const { address } = decrypt(saved);
      return res.status(200).json({ ok: true, hasWallet: true, address });
    }

    if (action === "export" && req.method === "POST") {
      const { context } = req.body || {};
      const { userId } = requireVerifiedUser(context);

      const saved = await loadWallet(userId);
      if (!saved) return res.status(404).json({ ok: false });

      const { privateKey } = decrypt(saved);
      return res.status(200).json({ ok: true, privateKey });
    }

    return res.status(405).json({ ok: false });
  } catch {
    return res.status(500).json({ ok: false });
  }
}
