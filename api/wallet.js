import { encrypt, decrypt, loadWallet, saveWallet } from "../../lib/wallet";
import {
  requireVerifiedUser,
  isValidPrivateKey,
  privateKeyToAddress,
} from "../../lib/utils";

export default async function handler(req, res) {
  try {
    const action = String(req.query.action || "").toLowerCase();

    if (action === "import" && req.method === "POST") {
      const { context, privateKey } = req.body || {};

      let user;
      try {
        user = requireVerifiedUser(context);
      } catch {
        return res.status(401).json({ ok: false });
      }

      if (!isValidPrivateKey(privateKey)) {
        return res.status(400).json({ ok: false });
      }

      const address = privateKeyToAddress(privateKey);
      if (!address) return res.status(400).json({ ok: false });

      const payload = encrypt({ address, privateKey });
      await saveWallet(user.userId, payload);

      return res.status(200).json({ ok: true, address });
    }

    if (action === "me" && req.method === "GET") {
      let context = null;
      try {
        context = req.query.context ? JSON.parse(req.query.context) : null;
      } catch {}

      let user;
      try {
        user = requireVerifiedUser(context);
      } catch {
        return res.status(401).json({ ok: false });
      }

      const saved = await loadWallet(user.userId);
      if (!saved) {
        return res.status(200).json({ ok: true, hasWallet: false });
      }

      const { address } = decrypt(saved);
      return res.status(200).json({ ok: true, hasWallet: true, address });
    }

    if (action === "export" && req.method === "POST") {
      const { context } = req.body || {};

      let user;
      try {
        user = requireVerifiedUser(context);
      } catch {
        return res.status(401).json({ ok: false });
      }

      const saved = await loadWallet(user.userId);
      if (!saved) {
        return res.status(404).json({ ok: false });
      }

      const { privateKey } = decrypt(saved);
      return res.status(200).json({ ok: true, privateKey });
    }

    return res.status(405).json({ ok: false });
  } catch {
    return res.status(500).json({ ok: false });
  }
}
