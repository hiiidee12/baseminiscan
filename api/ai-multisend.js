const crypto = require("crypto");
const { kv } = require("@vercel/kv");
const { ethers } = require("ethers");

const PREFIX = "bms:wallet:v1:";

function key32() {
  const master = process.env.MASTER_KEY;
  if (!master) throw new Error("MASTER_KEY missing");
  return crypto.createHash("sha256").update(master).digest();
}

function decrypt(payload) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key32(),
    Buffer.from(payload.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const out = Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(out.toString("utf8"));
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "POST only" });
    }

    const { userId, recipients } = req.body || {};
    if (!userId) return res.status(400).json({ ok: false, error: "userId required" });
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ ok: false, error: "recipients required" });
    }

    const saved = await kv.get(PREFIX + String(userId));
    if (!saved) return res.status(404).json({ ok: false, error: "wallet not found" });

    const data = decrypt(saved);
    if (!data?.mnemonic) return res.status(500).json({ ok: false, error: "mnemonic missing" });

    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) return res.status(500).json({ ok: false, error: "RPC_URL missing" });

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = ethers.Wallet.fromPhrase(data.mnemonic).connect(provider);

    if (recipients.length > 50) {
      return res.status(400).json({ ok: false, error: "max 50 recipients" });
    }

    const results = [];

    for (const r of recipients) {
      const to = String(r?.to || "").trim();
      const amountEth = String(r?.amountEth || "").trim();

      if (!ethers.isAddress(to)) {
        return res.status(400).json({ ok: false, error: `invalid address: ${to}` });
      }
      if (!amountEth || Number(amountEth) <= 0) {
        return res.status(400).json({ ok: false, error: `invalid amountEth for ${to}` });
      }

      const tx = await signer.sendTransaction({
        to,
        value: ethers.parseEther(amountEth),
      });

      results.push({ to, amountEth, hash: tx.hash });
      await tx.wait();
    }

    return res.status(200).json({
      ok: true,
      from: signer.address,
      count: results.length,
      results,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
};
