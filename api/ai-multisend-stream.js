const crypto = require("crypto");
const { kv } = require("@vercel/kv");
const { ethers } = require("ethers");

const PREFIX = "bms:aiwallet:v1:";

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

function sse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const userId = String(req.query.userId || "").trim();
    const amountEth = String(req.query.amountEth || "").trim();
    const toListRaw = String(req.query.to || "").trim(); // comma separated
    const toList = toListRaw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    if (!userId) {
      sse(res, "error", { ok: false, error: "userId required" });
      return res.end();
    }
    if (!amountEth || Number(amountEth) <= 0) {
      sse(res, "error", { ok: false, error: "amountEth invalid" });
      return res.end();
    }
    if (!toList.length) {
      sse(res, "error", { ok: false, error: "to required" });
      return res.end();
    }

    const saved = await kv.get(PREFIX + userId);
    if (!saved) {
      sse(res, "error", { ok: false, error: "wallet not found" });
      return res.end();
    }

    const data = decrypt(saved);
    if (!data?.mnemonic) {
      sse(res, "error", { ok: false, error: "mnemonic missing" });
      return res.end();
    }

    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) {
      sse(res, "error", { ok: false, error: "RPC_URL missing" });
      return res.end();
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = ethers.Wallet.fromPhrase(data.mnemonic).connect(provider);

    sse(res, "start", { ok: true, from: signer.address, count: toList.length });

    for (let i = 0; i < toList.length; i++) {
      const to = toList[i];
      if (!ethers.isAddress(to)) {
        sse(res, "failed", { index: i, to, amountEth, error: "invalid address" });
        continue;
      }

      try {
        sse(res, "sending", { index: i, to, amountEth });

        const tx = await signer.sendTransaction({
          to,
          value: ethers.parseEther(amountEth),
        });

        sse(res, "sent", { index: i, to, amountEth, hash: tx.hash });

        const receipt = await tx.wait();
        sse(res, "mined", {
          index: i,
          to,
          amountEth,
          hash: tx.hash,
          status: receipt?.status ?? null,
          blockNumber: receipt?.blockNumber ?? null,
        });
      } catch (e) {
        sse(res, "failed", {
          index: i,
          to,
          amountEth,
          error: e?.message || String(e),
        });
      }
    }

    sse(res, "done", { ok: true });
    return res.end();
  } catch (e) {
    sse(res, "error", { ok: false, error: e?.message || String(e) });
    return res.end();
  }
};
