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
  if (typeof res.flush === "function") res.flush();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseDelayMs(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(Math.floor(n), 0), 10_000);
}

function asCsvList(v) {
  return String(v || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function uniqLowerAddrs(list) {
  const out = [];
  const seen = new Set();
  for (const a of list) {
    const k = String(a || "").toLowerCase();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
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
      try {
        const j = JSON.parse(m);
        return j && typeof j === "object" ? j : null;
      } catch {
        return null;
      }
    }
    return m && typeof m === "object" ? m : null;
  } catch {
    return null;
  }
}

async function __saveMemory(userId, mem) {
  await kv.set(MEM_PREFIX + String(userId), mem);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const userId = String(req.query.userId || "").trim();
    const amountEth = String(req.query.amountEth || "").trim();
    const toListRaw = String(req.query.to || "").trim();
    const delayMs = parseDelayMs(req.query.delayMs, 1500);

    const toList = uniqLowerAddrs(asCsvList(toListRaw));

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
    if (toList.length > 50) {
      sse(res, "error", { ok: false, error: "max 50 recipients" });
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

    let nonce = await signer.getNonce("pending");

    let successCount = 0;
    let failedCount = 0;
    let totalSentWei = 0n;

    const successfulTo = [];

    sse(res, "start", {
      ok: true,
      from: signer.address,
      count: toList.length,
      delayMs,
      startNonce: nonce,
    });

    const amtWei = ethers.parseEther(amountEth);

    for (let i = 0; i < toList.length; i++) {
      const to = toList[i];

      if (!ethers.isAddress(to)) {
        failedCount++;
        sse(res, "failed", { index: i, to, amountEth, error: "invalid address" });

        if (delayMs > 0 && i < toList.length - 1) {
          await sleep(delayMs);
        }
        continue;
      }

      try {
        sse(res, "sending", { index: i, to, amountEth });

        const tx = await signer.sendTransaction({
          to,
          value: amtWei,
          nonce: nonce++,
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

        successCount++;
        totalSentWei += amtWei;
        successfulTo.push(to);

        if (delayMs > 0 && i < toList.length - 1) {
          await sleep(delayMs);
        }
      } catch (e) {
        const msg = e?.message || String(e);

        if (/nonce/i.test(msg) || /replacement/i.test(msg) || /underpriced/i.test(msg)) {
          try {
            nonce = await signer.getNonce("pending");
          } catch {}
        }

        failedCount++;
        sse(res, "failed", {
          index: i,
          to,
          amountEth,
          error: msg,
        });

        if (delayMs > 0 && i < toList.length - 1) {
          await sleep(delayMs);
        }
      }
    }

    // MEMORY UPDATE (recent + stats)
    let memoryUpdated = false;
    try {
      const mem = (await __loadMemory(userId)) || {};
      const prevRecent = Array.isArray(mem.recentRecipients) ? mem.recentRecipients : [];
      const nextRecent = __uniqCap([...successfulTo, ...prevRecent], 10);

      const stats = (mem.stats && typeof mem.stats === "object") ? mem.stats : {};
      const prevTx = Number(stats.totalTx || 0);
      const prevWei = (() => {
        try {
          const s = stats.totalSentWei;
          if (typeof s === "string" && s.trim()) return BigInt(s);
          return 0n;
        } catch {
          return 0n;
        }
      })();

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
      memoryUpdated = true;
    } catch {}

    sse(res, "done", {
      ok: true,
      success: successCount,
      failed: failedCount,
      totalSentEth: ethers.formatEther(totalSentWei),
      sentTo: successfulTo,
      memoryUpdated,
    });
    return res.end();
  } catch (e) {
    sse(res, "error", { ok: false, error: e?.message || String(e) });
    return res.end();
  }
};
