const crypto = require("crypto");
const { kv } = require("@vercel/kv");
const { ethers } = require("ethers");

const PREFIX = "bms:aiwallet:v1:";
const MEM_PREFIX = "bms:aimemory:v1:";

function key32() {
  const master = process.env.MASTER_KEY;
  if (!master) throw new Error("MASTER_KEY missing");
  return crypto.createHash("sha256").update(master).digest();
}

function decrypt(payload) {
  if (!payload) throw new Error("Payload missing");
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function __uniqCap(list, cap) {
  const out = [];
  const seen = new Set();
  for (const x of list) {
    const v = String(x || "").trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= cap) break;
  }
  return out;
}

async function __loadMemory(userId) {
  try {
    const m = await kv.get(MEM_PREFIX + String(userId));
    if (!m) return null;
    if (typeof m === "string") {
      try { return JSON.parse(m); } catch { return null; }
    }
    return m && typeof m === "object" ? m : null;
  } catch { return null; }
}

async function __saveMemory(userId, mem) {
  await kv.set(MEM_PREFIX + String(userId), mem);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const userId = String(body.userId || "").trim();
    const recipients = Array.isArray(body.recipients) ? body.recipients : [];

    if (!userId) return res.status(400).json({ ok: false, error: "userId required" });
    if (!recipients.length) return res.status(400).json({ ok: false, error: "recipients required" });
    if (recipients.length > 50) return res.status(400).json({ ok: false, error: "max 50 recipients" });

    const saved = await kv.get(PREFIX + userId);
    if (!saved) {
      console.error("Wallet not found for:", userId);
      return res.status(404).json({ ok: false, error: "wallet not found" });
    }

    let data;
    try {
      data = decrypt(saved);
    } catch (e) {
      console.error("Decryption failed:", e);
      return res.status(500).json({ ok: false, error: "failed to decrypt wallet" });
    }

    if (!data?.mnemonic) {
      return res.status(500).json({ ok: false, error: "mnemonic missing" });
    }

    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) {
      return res.status(500).json({ ok: false, error: "RPC_URL missing" });
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = ethers.Wallet.fromPhrase(data.mnemonic).connect(provider);

    let nonce = await signer.getNonce("pending");
    let successCount = 0;
    let failedCount = 0;
    let totalSentWei = 0n;
    const results = [];
    const successfulTo = [];

    for (let i = 0; i < recipients.length; i++) {
      const item = recipients[i];
      const to = item.to;
      const amountEth = item.amountEth;

      if (!amountEth || Number(amountEth) <= 0) {
        failedCount++;
        results.push({ index: i, to, amountEth, status: "failed", error: "invalid amount" });
        continue;
      }

      if (!ethers.isAddress(to)) {
        failedCount++;
        results.push({ index: i, to, amountEth, status: "failed", error: "invalid address" });
        continue;
      }

      try {
        const amtWei = ethers.parseEther(String(amountEth));
        
        const tx = await signer.sendTransaction({
          to,
          value: amtWei,
          nonce: nonce++,
        });

        const receipt = await tx.wait();

        successCount++;
        totalSentWei += amtWei;
        successfulTo.push(to);
        
        results.push({
          index: i,
          to,
          amountEth,
          status: "success",
          hash: tx.hash,
          blockNumber: receipt?.blockNumber
        });

      } catch (e) {
        const msg = e?.message || String(e);
        console.error(`Tx ${i} failed:`, msg);
        
        failedCount++;
        results.push({ index: i, to, amountEth, status: "failed", error: msg });
        
        if (/nonce/i.test(msg) || /replacement/i.test(msg) || /underpriced/i.test(msg)) {
          try { nonce = await signer.getNonce("pending"); } catch {}
        }
      }
      
      if (i < recipients.length - 1) await sleep(1000);
    }

    try {
      const mem = (await __loadMemory(userId)) || {};
      const prevRecent = Array.isArray(mem.recentRecipients) ? mem.recentRecipients : [];
      const nextRecent = __uniqCap([...successfulTo, ...prevRecent], 10);

      const stats = (mem.stats && typeof mem.stats === "object") ? mem.stats : {};
      const prevTx = Number(stats.totalTx || 0);
      
      let prevWei = 0n;
      try {
        const s = stats.totalSentWei;
        if (typeof s === "string" && s.trim()) prevWei = BigInt(s);
      } catch {}

      const nextWei = prevWei + totalSentWei;

      const nextMem = {
        ...mem,
        recentRecipients: nextRecent,
        stats: {
          ...stats,
          totalTx: prevTx + successCount,
          totalSentWei: nextWei.toString(),
          totalSentEth: ethers.formatEther(nextWei),
          lastTransferAt: Date.now(),
        },
      };
      await __saveMemory(userId, nextMem);
    } catch (e) {
      console.error("Failed to update memory:", e);
    }

    return res.status(200).json({
      ok: true,
      from: signer.address,
      count: recipients.length,
      success: successCount,
      failed: failedCount,
      totalSentEth: ethers.formatEther(totalSentWei),
      results: results,
    });

  } catch (e) {
    console.error("Multisend Critical Error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Critical server error" });
  }
}
