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

  // Fallback yang pasti jalan di Mini App webview & browser
  window.location.href = url;
}

function setActiveTab(tab) {
  const tx = $("tabTx");
  const erc = $("tabErc20");
  if (!tx || !erc) return;

  if (tab === "tx") {
    tx.classList.remove("secondary");
    erc.classList.add("secondary");
  } else {
    erc.classList.remove("secondary");
    tx.classList.add("secondary");
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

// Buttons
$("open").onclick = async () => {
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

// Tabs
$("tabTx").onclick = async () => {
  const q = $("query").value.trim();
  if (!isAddress(q)) return;
  await loadAddressView(q, "tx");
};

$("tabErc20").onclick = async () => {
  const q = $("query").value.trim();
  if (!isAddress(q)) return;
  await loadAddressView(q, "erc20");
};

// Enter key
$("query").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("open").click();
});
