import { Wallet } from "ethers";
import {
  getEncryptedWalletPayload,
  setEncryptedWalletPayload,
  encryptObj,
  decryptObj,
} from "../../lib/walletStore";

export default async function handler(req, res) {
  try {
    const userId = req.method === "POST"
      ? req.body?.userId
      : req.query?.userId;

    if (!userId) {
      return res.status(400).json({ ok: false, error: "userId required" });
    }

    const saved = await getEncryptedWalletPayload(userId);

    if (saved) {
      const data = decryptObj(saved);
      const wallet = Wallet.fromPhrase(data.mnemonic);
      return res.json({
        ok: true,
        address: wallet.address,
        created: false,
      });
    }

    const w = Wallet.createRandom();
    const payload = encryptObj({
      mnemonic: w.mnemonic.phrase,
      createdAt: Date.now(),
    });

    await setEncryptedWalletPayload(userId, payload);

    return res.json({
      ok: true,
      address: w.address,
      created: true,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
