// app.js

const $ = (id) => document.getElementById(id);

const isAddress = (v) => /^0x[a-fA-F0-9]{40}$/.test(v);
const isTx = (v) => /^0x[a-fA-F0-9]{64}$/.test(v);
const isBlock = (v) => /^[0-9]{1,20}$/.test(v);

function shortHex(h, a = 6, b = 4) {
  if (!h || h.length < a + b + 2) return h || "-";
  return `${h.slice(0, a + 2)}…${h.slice(-b)}`;
}

function makeBaseScanUrl(q) {
  if (isTx(q)) return `https://basescan.org/tx/${q}`;
  if (isAddress(q)) return `https://basescan.org/address/${q}`;
  if (isBlock(q)) return `https://basescan.org/block/${q}`;
  return `https://basescan.org/search?f=0&q=${encodeURIComponent(q)}`;
}

function weiToEthStr(wei, decimals = 6) {
  const n = Number(wei);
  if (!Number.isFinite(n)) return null;
  return (n / 1e18).toFixed(decimals);
}

async function openExternal(url) {
  try {
    if (window.__fcSdk && (await window.__fcSdk.isInMiniApp())) {
      await window.__fcSdk.actions.openUrl(url);
      return;
    }
  } catch (e) {}
  window.open(url, "_blank", "noopener,noreferrer");
}

function setActiveTab(tab) {
  const tx = $("tabTx");
  const erc = $("tabErc20");
  const gas = $("gas");
  if (!tx || !erc || !gas) return;

  const on = (btn) => btn.classList.remove("secondary");
  const off = (btn) => btn.classList.add("secondary");

  if (tab === "tx") {
    on(tx);
    off(erc);
    off(gas);
  } else if (tab === "erc20") {
    off(tx);
    on(erc);
    off(gas);
  } else {
    off(tx);
    off(erc);
    on(gas);
  }
}

function renderOverview(address, balanceWei) {
  const eth = weiToEthStr(balanceWei, 6);
  return `
    <div class="resultCard">
      <div class="badge">Address</div>
      <div style="margin-top:10px;font-size:14px;">
        <b class="click" data-open="${makeBaseScanUrl(address)}">${shortHex(address, 8, 6)}</b>
      </div>
      <div style="margin-top:10px;font-size:14px;">
        Balance: <b>${eth ?? balanceWei} ETH</b> (Base)
      </div>
      <div class="muted" style="margin-top:8px;">Raw: ${balanceWei} wei</div>
    </div>
  `;
}

function ageFromTs(ts) {
  const t = Number(ts) * 1000;
  if (!Number.isFinite(t)) return "-";
  const diff = Date.now() - t;
  const s = Math.max(0, Math.floor(diff / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return `${s}s ago`;
}

function renderTxTable(list) {
  const rows = list
    .slice(0, 25)
    .map((tx) => {
      const hash = tx.hash || tx.transactionHash || "-";
      const from = tx.from || "-";
      const to = tx.to || "-";
      const valueEth = weiToEthStr(tx.value || "0", 6) || "0.000000";
      const age = tx.timeStamp ? ageFromTs(tx.timeStamp) : "-";
      const block = tx.blockNumber || "-";

      return `
      <tr>
        <td>
          <span class="click" data-open="${makeBaseScanUrl(hash)}">${shortHex(hash)}</span>
          <div class="small">Block ${block}</div>
        </td>
        <td class="small">${age}</td>
        <td class="small"><span class="click" data-open="${makeBaseScanUrl(from)}">${shortHex(from)}</span></td>
        <td class="small"><span class="click" data-open="${makeBaseScanUrl(to)}">${shortHex(to)}</span></td>
        <td>${valueEth}</td>
      </tr>
    `;
    })
    .join("");

  return `
    <div class="tableWrap">
      <div class="tableScroll">
        <table>
          <thead>
            <tr>
              <th>Txn Hash</th>
              <th>Age</th>
              <th>From</th>
              <th>To</th>
              <th>Value (ETH)</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="5" class="small">No transactions found.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderErc20Table(list) {
  const rows = list
    .slice(0, 25)
    .map((t) => {
      const hash = t.hash || t.transactionHash || "-";
      const token = t.tokenSymbol || "-";
      const tokenName = t.tokenName || token;
      const from = t.from || "-";
      const to = t.to || "-";
      const age = t.timeStamp ? ageFromTs(t.timeStamp) : "-";

      const dec = Number(t.tokenDecimal || "0");
      const raw = t.value || "0";
      let amount = raw;
      const n = Number(raw);
      if (Number.isFinite(n) && dec >= 0 && dec <= 18) {
        amount = (n / Math.pow(10, dec)).toFixed(6);
      }

      return `
      <tr>
        <td><span class="click" data-open="${makeBaseScanUrl(hash)}">${shortHex(hash)}</span></td>
        <td class="small">${age}</td>
        <td>
          <div><b>${token}</b></div>
          <div class="small">${tokenName}</div>
        </td>
        <td class="small"><span class="click" data-open="${makeBaseScanUrl(from)}">${shortHex(from)}</span></td>
        <td class="small"><span class="click" data-open="${makeBaseScanUrl(to)}">${shortHex(to)}</span></td>
        <td>${amount}</td>
      </tr>
    `;
    })
    .join("");

  return `
    <div class="tableWrap">
      <div class="tableScroll">
        <table>
          <thead>
            <tr>
              <th>Txn Hash</th>
              <th>Age</th>
              <th>Token</th>
              <th>From</th>
              <th>To</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="6" class="small">No token transfers found.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function loadAddressView(address, tab = "tx") {
  setActiveTab(tab);
  $("output").innerHTML = `<div class="muted">Loading ${
    tab === "tx" ? "transactions" : "ERC-20 transfers"
  }…</div>`;

  const url = `/api/address?address=${encodeURIComponent(address)}&tab=${encodeURIComponent(
    tab
  )}&offset=25&page=1`;

  const res = await fetch(url);
  const json = await res.json();

  if (!res.ok || json?.error) {
    $("output").innerHTML = `<pre>${JSON.stringify(json, null, 2)}</pre>`;
    return;
  }

  const overview = renderOverview(address, json.balanceWei);
  const table = tab === "erc20" ? renderErc20Table(json.list) : renderTxTable(json.list);

  $("output").innerHTML = overview + table;

  $("output").querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", () => openExternal(el.getAttribute("data-open")));
  });
}

/* ---------------- GAS TRACKER ---------------- */

let __gasTimer = null;

function fmtGwei(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return n < 1 ? n.toFixed(3) : n.toFixed(1);
}

function gasUtilPercent(gasUsedRatio) {
  if (gasUsedRatio == null) return "-";
  const n = Number(gasUsedRatio);
  if (!Number.isFinite(n)) return "-";
  return (n * 100).toFixed(2) + "%";
}

function feeUsd(ethUsd, gwei, gasUnits) {
  const p = Number(ethUsd);
  const g = Number(gwei);
  if (!Number.isFinite(p) || !Number.isFinite(g)) return "-";
  const eth = g * 1e-9 * gasUnits;
  const usd = eth * p;
  if (!Number.isFinite(usd)) return "-";
  return `$${usd.toFixed(3)}`;
}

function renderGas(g, nextSec) {
  const standard = fmtGwei(g.safe);
  const fast = fmtGwei(g.fast);
  const rapid = fmtGwei(g.rapid);

  const GAS_ERC20 = 65000;
  const GAS_SWAP = 180000;
  const GAS_LP = 220000;

  return `
    <div class="gasWrap">
      <div class="gasTopBar">
        <div class="gasTitle">Base Gas Tracker ⛽</div>
        <div class="gasNext">Next update in <b>${nextSec}s</b></div>
      </div>

      <div class="gasGrid">
        <div class="gasCard">
          <div class="gasCardHead"><div class="gasEmoji">🙂</div> Standard</div>
          <div class="gasValue standard">${standard} Gwei</div>
          <div class="gasSub">&lt; $0.01 | ~ 12–16 secs</div>
        </div>

        <div class="gasCard">
          <div class="gasCardHead"><div class="gasEmoji">😄</div> Fast</div>
          <div class="gasValue fast">${fast} Gwei</div>
          <div class="gasSub">&lt; $0.01 | ~ 6–8 secs</div>
        </div>

        <div class="gasCard center">
          <div class="gasCardHead"><div class="gasEmoji">🚀</div> Rapid</div>
          <div class="gasValue rapid">${rapid} Gwei</div>
          <div class="gasSub">&lt; $0.01 | ~ 2–3 secs</div>
        </div>
      </div>

      <div class="resultCard" style="padding:14px;">
        <div style="font-weight:800;margin-bottom:10px;">Additional Info</div>

        <div class="gasInfoGrid">
          <div class="gasInfoCard">
            <div class="gasInfoLabel">LAST BLOCK</div>
            <div class="gasInfoValue">${g.lastBlock ?? "-"}</div>
          </div>
          <div class="gasInfoCard">
            <div class="gasInfoLabel">AVG. UTILIZATION</div>
            <div class="gasInfoValue">${gasUtilPercent(g.gasUsedRatio)}</div>
          </div>
        </div>

        <div class="gasFoot">
          ETH/USD: <b>${g.ethUsd ? `$${Number(g.ethUsd).toFixed(2)}` : "-"}</b> • Source: ${
    g.source || "base-rpc"
  }
        </div>

        <div style="margin-top:14px;font-weight:800;">Featured Actions</div>
        <div class="gasActionTableWrap">
          <table class="gasActionTable">
            <thead>
              <tr><th>Action</th><th>Low</th><th>Average</th><th>High</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>ERC-20 Transfer</td>
                <td>${feeUsd(g.ethUsd, g.safe, GAS_ERC20)}</td>
                <td>${feeUsd(g.ethUsd, g.fast, GAS_ERC20)}</td>
                <td>${feeUsd(g.ethUsd, g.rapid, GAS_ERC20)}</td>
              </tr>
              <tr>
                <td>Swap</td>
                <td>${feeUsd(g.ethUsd, g.safe, GAS_SWAP)}</td>
                <td>${feeUsd(g.ethUsd, g.fast, GAS_SWAP)}</td>
                <td>${feeUsd(g.ethUsd, g.rapid, GAS_SWAP)}</td>
              </tr>
              <tr>
                <td>Add/Remove LP</td>
                <td>${feeUsd(g.ethUsd, g.safe, GAS_LP)}</td>
                <td>${feeUsd(g.ethUsd, g.fast, GAS_LP)}</td>
                <td>${feeUsd(g.ethUsd, g.rapid, GAS_LP)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="gasFoot">Note: estimasi USD = (gwei × gasUnits) × ETH/USD</div>
      </div>
    </div>
  `;
}

async function loadGasOnce(nextSec = 10) {
  $("output").innerHTML = `<div class="muted">Loading gas…</div>`;
  try {
    const r = await fetch("/api/gas", { cache: "no-store" });

    // kalau /api/gas balik HTML/404, r.json() akan error -> sebelumnya bikin "loading terus"
    const text = await r.text();
    let j = null;
    try {
      j = JSON.parse(text);
    } catch (e) {
      throw new Error(`Gas API not JSON (HTTP ${r.status}).`);
    }

    if (!r.ok || j?.error) {
      $("output").innerHTML = `<pre>${JSON.stringify(j, null, 2)}</pre>`;
      return false;
    }

    $("output").innerHTML = renderGas(j, nextSec);
    return true;
  } catch (e) {
    $("output").innerHTML = `<pre>${String(e?.message || e)}</pre>`;
    return false;
  }
}

function stopGasAutoRefresh() {
  if (__gasTimer) {
    clearInterval(__gasTimer);
    __gasTimer = null;
  }
}

function startGasAutoRefresh() {
  setActiveTab("gas");
  stopGasAutoRefresh();

  let next = 10;
  loadGasOnce(next);

  __gasTimer = setInterval(async () => {
    next -= 1;

    if (next <= 0) {
      next = 10;
      await loadGasOnce(next);
    } else {
      const b = document.querySelector(".gasNext b");
      if (b) b.textContent = `${next}s`;
    }
  }, 1000);
}

/* ---------------- BUTTONS / TABS ---------------- */

$("open").onclick = async () => {
  stopGasAutoRefresh();

  const q = $("query").value.trim();
  if (!q) return;

  if (isAddress(q)) {
    $("link").textContent = "";
    await loadAddressView(q, "tx");
    return;
  }

  const url = makeBaseScanUrl(q);
  $("link").innerHTML = `Link: <a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  await openExternal(url);
};

$("fetch").onclick = async () => {
  stopGasAutoRefresh();

  const q = $("query").value.trim();
  if (!q) return;

  if (isAddress(q)) {
    await loadAddressView(q, "tx");
    return;
  }

  $("output").innerHTML = `<div class="muted">Loading…</div>`;
  try {
    const res = await fetch(`/api/basescan?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    $("output").innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
  } catch (e) {
    $("output").innerHTML = `<pre>${e.toString()}</pre>`;
  }
};

$("tabTx").onclick = async () => {
  stopGasAutoRefresh();

  const q = $("query").value.trim();
  if (!isAddress(q)) return;
  await loadAddressView(q, "tx");
};

$("tabErc20").onclick = async () => {
  stopGasAutoRefresh();

  const q = $("query").value.trim();
  if (!isAddress(q)) return;
  await loadAddressView(q, "erc20");
};

if ($("gas")) {
  $("gas").onclick = () => startGasAutoRefresh();
}

$("query").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("open").click();
});
```0
