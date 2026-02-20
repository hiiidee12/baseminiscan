import { Wallet } from "ethers";
import { encrypt, decrypt, loadWallet, saveWallet } from "../lib/walletStore.js";

export default async (req, res) => {
  try {
    const userId = req.query.userId || req.body?.userId;
    if (!userId) {
      return res.status(400).json({ ok: false, error: "userId required" });
    }

    const saved = await loadWallet(userId);

    if (saved) {
      const data = decrypt(saved);
      const wallet = Wallet.fromPhrase(data.mnemonic);
      return res.status(200).json({
        ok: true,
        address: wallet.address,
        created: false,
      });
    }

    const wallet = Wallet.createRandom();
    const payload = encrypt({
      mnemonic: wallet.mnemonic.phrase,
      createdAt: Date.now(),
    });

    await saveWallet(userId, payload);

    return res.status(200).json({
      ok: true,
      address: wallet.address,
      created: true,
    });
  } catch (err) {
    console.error("AI WALLET ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "internal error",
    });
  }
};
