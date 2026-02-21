// /pages/api/wallet.js
import { encrypt, decrypt, loadWallet, saveWallet } from "@/lib/wallet";
import {
  requireVerifiedUser,
  isValidPrivateKey,
  privateKeyToAddress,
} from "@/lib/utils";

export default async function handler(req, res) {
  console.log("=== WALLET API HIT ===");
  console.log("method:", req.method);
  console.log("query:", req.query);

  try {
    const action = String(req.query.action || "").toLowerCase();
    console.log("action:", action);

    if (action === "import" && req.method === "POST") {
      console.log("IMPORT BODY:", req.body);

      const { context, privateKey } = req.body || {};

      let user;
      try {
        user = requireVerifiedUser(context);
      } catch (e) {
        console.error("VERIFY ERROR (import):", e);
        return res.status(401).json({ ok: false, error: "not_verified" });
      }

      console.log("USER:", user);

      if (!isValidPrivateKey(privateKey)) {
        console.error("INVALID PK");
        return res.status(400).json({ ok: false, error: "invalid_pk" });
      }

      const address = privateKeyToAddress(privateKey);
      console.log("DERIVED ADDRESS:", address);

      const payload = encrypt({ address, privateKey });
      console.log("ENCRYPTED PAYLOAD:", payload);

      await saveWallet(user.userId, payload);
      console.log("WALLET SAVED FOR:", user.userId);

      return res.status(200).json({ ok: true, address });
    }

    if (action === "me" && req.method === "GET") {
      console.log("ME QUERY:", req.query);

      let context = null;
      try {
        context = req.query.context ? JSON.parse(req.query.context) : null;
      } catch (e) {
        console.error("CONTEXT PARSE ERROR:", e);
      }

      let user;
      try {
        user = requireVerifiedUser(context);
      } catch (e) {
        console.error("VERIFY ERROR (me):", e);
        return res.status(401).json({ ok: false, error: "not_verified" });
      }

      console.log("USER:", user);

      const saved = await loadWallet(user.userId);
      console.log("SAVED WALLET:", saved);

      if (!saved) {
        return res.status(200).json({ ok: true, hasWallet: false });
      }

      const { address } = decrypt(saved);
      console.log("DECRYPTED ADDRESS:", address);

      return res.status(200).json({ ok: true, hasWallet: true, address });
    }

    if (action === "export" && req.method === "POST") {
      console.log("EXPORT BODY:", req.body);

      const { context } = req.body || {};

      let user;
      try {
        user = requireVerifiedUser(context);
      } catch (e) {
        console.error("VERIFY ERROR (export):", e);
        return res.status(401).json({ ok: false, error: "not_verified" });
      }

      console.log("USER:", user);

      const saved = await loadWallet(user.userId);
      console.log("SAVED WALLET:", saved);

      if (!saved) {
        return res.status(404).json({ ok: false, error: "wallet_not_found" });
      }

      const { privateKey } = decrypt(saved);
      console.log("PK DECRYPTED (length only):", privateKey?.length);

      return res.status(200).json({ ok: true, privateKey });
    }

    console.error("METHOD / ACTION NOT ALLOWED");
    return res.status(405).json({ ok: false });
  } catch (e) {
    console.error("WALLET API FATAL ERROR:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}
