export default async function handler(req, res) {
  try {
    const address = (req.query.address || "").toString().trim();

    const tabRaw = (req.query.tab || "tx").toString().trim().toLowerCase();
    const tab =
      tabRaw === "erc20" ? "erc20" :
      tabRaw === "internal" ? "internal" :
      tabRaw === "nft" ? "nft" :
      "tx";

    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const offset = Math.min(25, Math.max(1, parseInt(req.query.offset || "25", 10)));
    const wantCount = (req.query.count ?? "1").toString() !== "0";

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: "Invalid address" });
    }

    const cacheByTab = {
      tx: "s-maxage=10, stale-while-revalidate=60",
      erc20: "s-maxage=0, max-age=0, must-revalidate",
      internal: "s-maxage=60, stale-while-revalidate=100",
      nft: "s-maxage=60, stale-while-revalidate=100",
    };
    res.setHeader("Cache-Control", cacheByTab[tab] || cacheByTab.tx);
    res.setHeader("Vary", "Accept-Encoding");

    // Alchemy key pool (Base Mainnet) - single key
    const ALCHEMY_KEYS = [process.env.A_KEY].filter(Boolean);

    if (!ALCHEMY_KEYS.length) {
      return res.status(200).json({
        address,
        chain: "base",
        tab,
        balanceWei: null,
        txCount: null,
        list: [],
        error: "NO_ALCHEMY_API_KEYS",
      });
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const fetchJson = async (url, body, { timeoutMs = 12_000 } = {}) => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: ctl.signal,
        });
        let json = null;
        try {
          json = await r.json();
        } catch {
          const text = await r.text().catch(() => "");
          json = { error: { message: text?.slice(0, 200) || "Bad JSON" } };
        }
        return { json, httpStatus: r.status, ok: r.ok };
      } finally {
        clearTimeout(t);
      }
    };

    const fetchJsonGet = async (url, { timeoutMs = 12_000 } = {}) => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const r = await fetch(url, { method: "GET", signal: ctl.signal });
        let json = null;
        try {
          json = await r.json();
        } catch {
          const text = await r.text().catch(() => "");
          json = { error: { message: text?.slice(0, 200) || "Bad JSON" } };
        }
        return { json, httpStatus: r.status, ok: r.ok };
      } finally {
        clearTimeout(t);
      }
    };

    const isTransientHttp = (s) => [429, 500, 502, 503, 504].includes(s);

    const tryWithPool = async (pool, fn, { retryDelayMs = 250 } = {}) => {
      let lastErr;
      for (let i = 0; i < pool.length; i++) {
        const k = pool[i];
        try {
          return await fn(k);
        } catch (e) {
          lastErr = e;
          await sleep(retryDelayMs + Math.floor(Math.random() * 200));
        }
      }
      throw lastErr || new Error("ALL_KEYS_FAILED");
    };

    const rpc = async (apikey, method, params) => {
      const url = `https://base-mainnet.g.alchemy.com/v2/${apikey}`;
      const payload = { jsonrpc: "2.0", id: 1, method, params };
      const { json, httpStatus, ok } = await fetchJson(url, payload);

      if (!ok || json?.error) {
        const msg = (json?.error?.message || "").toString();
        const err = new Error(msg || "RPC_FAILED");
        err.__httpStatus = httpStatus;
        err.__rpcError = json?.error || null;
        throw err;
      }
      return json.result;
    };

    const hexCount = (n) => "0x" + Math.max(1, n).toString(16);

    const isoToTimeStamp = (iso) => {
      const t = Date.parse(iso);
      if (!Number.isFinite(t)) return "0";
      return Math.floor(t / 1000).toString();
    };

    const hexToDecStr = (hex) => {
      try {
        if (!hex) return null;
        const s = hex.toString();
        if (!s.startsWith("0x")) return s; // already decimal-ish
        return BigInt(s).toString(10);
      } catch {
        return null;
      }
    };

    // simple global cache for contract names (avoid spamming)
    const __nameCache =
      globalThis.__alchemyContractNameCache ||
      (globalThis.__alchemyContractNameCache = new Map());

    const getContractName = async (apikey, contractAddress) => {
      const k = (contractAddress || "").toLowerCase();
      if (!k) return null;

      const now = Date.now();
      const hit = __nameCache.get(k);
      if (hit && hit.expiresAt > now) return hit.name;

      const url =
        `https://base-mainnet.g.alchemy.com/nft/v2/${apikey}/getContractMetadata` +
        `?contractAddress=${encodeURIComponent(contractAddress)}`;

      const { json, httpStatus, ok } = await fetchJsonGet(url);
      if (!ok || json?.error) {
        const err = new Error(json?.error?.message || "CONTRACT_META_FAILED");
        err.__httpStatus = httpStatus;
        throw err;
      }

      const name =
        json?.contractMetadata?.name ||
        json?.contractMetadata?.openSea?.collectionName ||
        json?.contractMetadata?.opensea?.collectionName ||
        null;

      __nameCache.set(k, { name, expiresAt: now + 1 * 60 * 1000 }); // 1 min
      return name;
    };

    const normalizeTransfer = (t) => {
      const ts = isoToTimeStamp(t?.metadata?.blockTimestamp);

      const rawHex = t?.rawContract?.value ? t.rawContract.value : null;
      const rawDec = hexToDecStr(rawHex);

      const tokenId =
        t?.tokenId ??
        t?.erc721TokenId ??
        (t?.erc1155Metadata?.[0]?.tokenId ?? null);

      return {
        hash: t?.hash || "",
        from: t?.from || "",
        to: t?.to || "",

        // for renderers: prefer rawValue (base units) + decimals when present
        rawValue: rawDec ?? null,
        value: t?.value ?? null,

        asset: t?.asset ?? null,
        category: t?.category ?? null,

        blockNum: t?.blockNum ?? null,
        timeStamp: ts,

        contractAddress: t?.rawContract?.address || null,

        tokenId,
        uniqueId: t?.uniqueId || null,

        nftStd:
          t?.category === "erc721" ? "ERC-721" :
          t?.category === "erc1155" ? "ERC-1155" :
          t?.category === "specialnft" ? "NFT" :
          null,

        tokenName: null, // will be enriched for nft tab

        rawContract: {
          address: t?.rawContract?.address || null,
          value: rawHex,
          decimal: t?.rawContract?.decimal ?? null,
        },
      };
    };

    const balanceWei = await tryWithPool(ALCHEMY_KEYS, async (apikey) => {
      return await rpc(apikey, "eth_getBalance", [address, "latest"]);
    });

    // IMPORTANT: Base does NOT support "internal" category via Transfers API.
    // We return a clean empty response instead of throwing.
    if (tab === "internal") {
      return res.status(200).json({
        address,
        chain: "base",
        tab,
        balanceWei,
        txCount: null,
        list: [],
        error: "INTERNAL_NOT_SUPPORTED_ON_BASE",
      });
    }

    const desired = Math.min(250, page * offset);

    const categories =
      tab === "erc20" ? ["erc20"] :
      tab === "nft" ? ["erc721", "erc1155", "specialnft"] :
      ["external"];

    const order = "desc";

    const fetchTransfersUpTo = async (apikey) => {
      let collected = [];
      let pageKey = undefined;

      while (collected.length < desired) {
        const maxLeft = desired - collected.length;
        const maxCount = hexCount(Math.min(200, maxLeft));

        const params = [{
          fromBlock: "0x0",
          toBlock: "latest",
          fromAddress: address,
          category: categories,
          withMetadata: true,
          excludeZeroValue: false,
          maxCount,
          order,
        }];

        if (pageKey) params[0].pageKey = pageKey;

        const result = await rpc(apikey, "alchemy_getAssetTransfers", params);

        const transfers = Array.isArray(result?.transfers) ? result.transfers : [];
        collected.push(...transfers);

        pageKey = result?.pageKey;
        if (!pageKey || transfers.length === 0) break;
      }

      return collected;
    };

    let listRaw = [];
    try {
      listRaw = await tryWithPool(ALCHEMY_KEYS, async (apikey) => {
        return await fetchTransfersUpTo(apikey);
      });
    } catch {
      return res.status(200).json({
        address,
        chain: "base",
        tab,
        balanceWei,
        txCount: null,
        list: [],
        error: "ALCHEMY_LIST_FAILED",
      });
    }

    const normalized = listRaw.map(normalizeTransfer);

    // Enrich NFT collection name (contract name)
    if (tab === "nft") {
      const uniq = [];
      const seen = new Set();

      for (const it of normalized) {
        const ca = it.contractAddress;
        if (!ca) continue;
        const k = ca.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        uniq.push(ca);
        if (uniq.length >= 40) break; // limit
      }

      try {
        const nameMap = await tryWithPool(ALCHEMY_KEYS, async (apikey) => {
          const pairs = await Promise.all(
            uniq.map(async (ca) => {
              try {
                const n = await getContractName(apikey, ca);
                return [ca.toLowerCase(), n];
              } catch {
                return [ca.toLowerCase(), null];
              }
            })
          );
          return new Map(pairs);
        });

        for (const it of normalized) {
          if (!it.tokenName && it.contractAddress) {
            const n = nameMap.get(it.contractAddress.toLowerCase());
            if (n) it.tokenName = n;
          }
        }
      } catch {
        // silent
      }
    }

    normalized.sort((a, b) => Number(b.timeStamp) - Number(a.timeStamp));

    const start = (page - 1) * offset;
    const list = normalized.slice(start, start + offset);

    // txCount: keep null (Alchemy doesn't provide cheap full count like Etherscan)
    let txCount = null;
    if (wantCount) {
      txCount = null;
    }

    return res.status(200).json({
      address,
      chain: "base",
      tab,
      balanceWei,
      txCount,
      list,
    });
  } catch (e) {
    const msg = (e && e.message) ? e.message : "";
    return res.status(200).json({
      address: (req.query.address || "").toString().trim() || null,
      chain: "base",
      tab: ((req.query.tab || "tx").toString().trim().toLowerCase()) || "tx",
      balanceWei: null,
      txCount: null,
      list: [],
      error: "ALCHEMY_ERROR",
      code: msg || "UNKNOWN",
    });
  }
}
