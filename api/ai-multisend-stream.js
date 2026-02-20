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

async function executeMultisend({ userId, recipientsList, amountEthFixed, delayMs = 1000 }) {
  const saved = await kv.get(PREFIX + userId);
  if (!saved) throw new Error("wallet not found");

  let data;
  try {
    data = decrypt(saved);
  } catch (e) {
    throw new Error("failed to decrypt wallet");
  }

  if (!data?.mnemonic) throw new Error("mnemonic missing");

  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL missing");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = ethers.Wallet.fromPhrase(data.mnemonic).connect(provider);

  let nonce = await signer.getNonce("pending");
  let successCount = 0;
  let failedCount = 0;
  let totalSentWei = 0n;
  const results = [];
  const successfulTo = [];

  const tasks = recipientsList.map((item, index) => {
    let to, amount;
    if (typeof item === 'object' && item.to) {
      to = item.to;
      amount = item.amountEth;
    } else {
      to = item;
      amount = amountEthFixed;
    }
    return { index, to, amount };
  });

  for (let i = 0; i < tasks.length; i++) {
    const { index, to, amount } = tasks[i];

    if (!amount || Number(amount) <= 0) {
      failedCount++;
      results.push({ index, to, amount, status: "failed", error: "invalid amount" });
      if (delayMs > 0 && i < tasks.length - 1) await sleep(delayMs);
      continue;
    }

    if (!ethers.isAddress(to)) {
      failedCount++;
      results.push({ index, to, amount, status: "failed", error: "invalid address" });
      if (delayMs > 0 && i < tasks.length - 1) await sleep(delayMs);
      continue;
    }

    try {
      const amtWei = ethers.parseEther(String(amount));
      
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
        index,
        to,
        amount,
        status: "success",
        hash: tx.hash,
        blockNumber: receipt?.blockNumber
      });

    } catch (e) {
      const msg = e?.message || String(e);
      failedCount++;
      results.push({ index, to, amount, status: "failed", error: msg });
      
      if (/nonce/i.test(msg) || /replacement/i.test(msg) || /underpriced/i.test(msg)) {
        try { nonce = await signer.getNonce("pending"); } catch {}
      }
    }
    
    if (delayMs > 0 && i < tasks.length - 1) await sleep(delayMs);
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

  return {
    from: signer.address,
    count: tasks.length,
    success: successCount,
    failed: failedCount,
    totalSentEth: ethers.formatEther(totalSentWei),
    results,
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const isStreamMode = 
    req.headers.accept?.includes('text/event-stream') || 
    (req.method === 'GET' && req.query.to);

  if (isStreamMode) {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const sse = (event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      if (typeof res.flush === "function") res.flush();
    };

    try {
      const userId = String(req.query.userId || "").trim();
      const amountEth = String(req.query.amountEth || "").trim();
      const toListRaw = String(req.query.to || "").trim();
      const delayMs = Math.min(Math.max(Number(req.query.delayMs) || 1500, 0), 10000);

      const toList = String(toListRaw).split(",").map(x => x.trim()).filter(Boolean);

      if (!userId || !amountEth || !toList.length) {
        sse("error", { ok: false, error: "Missing params" });
        return res.end();
      }

      const saved = await kv.get(PREFIX + userId);
      if (!saved) throw new Error("wallet not found");
      const data = decrypt(saved);
      const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
      const signer = ethers.Wallet.fromPhrase(data.mnemonic).connect(provider);
      let nonce = await signer.getNonce("pending");
      
      let successCount = 0, failedCount = 0, totalSentWei = 0n;
      const successfulTo = [];

      sse("start", { ok: true, from: signer.address, count: toList.length, delayMs });

      for (let i = 0; i < toList.length; i++) {
        const to = toList[i];
        sse("sending", { index: i, to, amountEth });
        
        try {
          if (!ethers.isAddress(to)) throw new Error("invalid address");
          
          const tx = await signer.sendTransaction({
            to,
            value: ethers.parseEther(amountEth),
            nonce: nonce++,
          });

          sse("sent", { index: i, to, amountEth, hash: tx.hash });
          const receipt = await tx.wait();
          sse("mined", { index: i, hash: tx.hash, status: receipt.status });

          successCount++;
          totalSentWei += ethers.parseEther(amountEth);
          successfulTo.push(to);
        } catch (e) {
          sse("failed", { index: i, to, amountEth, error: e.message });
          failedCount++;
          if (/nonce/i.test(e.message)) {
             try { nonce = await signer.getNonce("pending"); } catch {}
          }
        }
        if (delayMs > 0 && i < toList.length - 1) await sleep(delayMs);
      }

      try {
        const mem = (await __loadMemory(userId)) || {};
        const prevRecent = Array.isArray(mem.recentRecipients) ? mem.recentRecipients : [];
        const nextRecent = __uniqCap([...successfulTo, ...prevRecent], 10);
        await __saveMemory(userId, {
            ...mem,
            recentRecipients: nextRecent,
            stats: {
                ...(mem.stats||{}),
                totalTx: (mem.stats?.totalTx||0) + successCount,
                lastTransferAt: Date.now()
            }
        });
      } catch {}

      sse("done", { ok: true, success: successCount, failed: failedCount, totalSentEth: ethers.formatEther(totalSentWei) });
      return res.end();

    } catch (e) {
      sse("error", { ok: false, error: e.message });
      return res.end();
    }

  } else {
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

      const result = await executeMultisend({
        userId,
        recipientsList: recipients,
        amountEthFixed: null,
        delayMs: 1000
      });

      return res.status(200).json({
        ok: true,
        ...result
      });

    } catch (e) {
      console.error("Multisend Critical Error:", e);
      return res.status(500).json({ ok: false, error: e.message || "Critical server error" });
    }
  }
}
