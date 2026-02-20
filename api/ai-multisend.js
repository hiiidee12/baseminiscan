import { ethers } from "ethers";
import { decrypt, loadWallet } from "../lib/walletStore.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "POST only" });
    }

    const { userId, recipients } = req.body || {};
    if (!userId) return res.status(400).json({ ok: false, error: "userId required" });
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ ok: false, error: "recipients required" });
    }
    if (recipients.length > 50) {
      return res.status(400).json({ ok: false, error: "max 50 recipients" });
    }

    const saved = await loadWallet(String(userId));
    if (!saved) return res.status(404).json({ ok: false, error: "wallet not found" });

    const data = decrypt(saved);
    const phrase = data?.mnemonic ? String(data.mnemonic) : "";
    if (!phrase) return res.status(500).json({ ok: false, error: "mnemonic missing" });

    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) return res.status(500).json({ ok: false, error: "RPC_URL missing" });

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = ethers.Wallet.fromPhrase(phrase).connect(provider);

    const feeData = await provider.getFeeData().catch(() => null);

    const results = [];

    for (const r of recipients) {
      const to = String(r?.to || "").trim();
      const amountEth = String(r?.amountEth || "").trim();

      if (!ethers.isAddress(to)) {
        return res.status(400).json({ ok: false, error: `invalid address: ${to}` });
      }

      let value;
      try {
        value = ethers.parseEther(amountEth);
      } catch {
        return res.status(400).json({ ok: false, error: `invalid amountEth for ${to}` });
      }

      if (value <= 0n) {
        return res.status(400).json({ ok: false, error: `invalid amountEth for ${to}` });
      }

      const txReq = { to, value };

      const gasLimit = await signer.estimateGas(txReq).catch(() => null);
      if (gasLimit) txReq.gasLimit = (gasLimit * 120n) / 100n;

      if (feeData?.maxFeePerGas && feeData?.maxPriorityFeePerGas) {
        txReq.maxFeePerGas = feeData.maxFeePerGas;
        txReq.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
      } else if (feeData?.gasPrice) {
        txReq.gasPrice = feeData.gasPrice;
      }

      const tx = await signer.sendTransaction(txReq);
      results.push({ to, amountEth, hash: tx.hash });
    }

    return res.status(200).json({
      ok: true,
      from: signer.address,
      count: results.length,
      results,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
