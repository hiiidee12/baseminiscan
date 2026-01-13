/* =========================
   Renderers
========================= */

function ageFromTs(ts) {
  const t = Number(ts) * 1000;
  if (!Number.isFinite(t)) return "-";
  const d = Math.floor((Date.now() - t) / 1000);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

async function loadFarcasterUsername(address) {
  if (window.__lastFarcasterAddress === address) return;
  window.__lastFarcasterAddress = address;

  const elDetail = document.getElementById("fcUserDetail");
  const elHome = document.getElementById("fcUser");

  if (elDetail) elDetail.textContent = "-";
  if (elHome) elHome.textContent = "@-";

  try {
    const r = await fetch(`/api/farcaster?address=${encodeURIComponent(address)}`);
    const j = await r.json();

    if (!j.ok || !j.username) return;

    const v = "@" + j.username;
    if (elDetail) elDetail.textContent = v;
    if (elHome) elHome.textContent = v;
  } catch (e) {
    // silent
  }
}

function renderHomeCard(data = {}) {
  const el = document.getElementById("homeCard");
  if (!el) return;

  const address = data?.address || "";
  const balance = data?.balance || "-";
  const txCount = data?.txCount || "-";

  el.innerHTML = `
    <div class="card">
      <div class="row">
        <div class="label">Wallet Address</div>
        <div class="value mono">${address || "-"}</div>
      </div>

      <div class="row">
        <div class="label">Farcaster Username</div>
        <div class="value mono" id="fcUser">@-</div>
      </div>

      <div class="row">
        <div class="label">ETH Balance</div>
        <div class="value">${balance}</div>
      </div>

      <div class="row">
        <div class="label">Total Transactions</div>
        <div class="value">${txCount}</div>
      </div>
    </div>
  `;

  if (address) loadFarcasterUsername(address);
}

function renderDetailOverview(data = {}) {
  const el = document.getElementById("detailOverview");
  if (!el) return;

  const address = data?.address || "";
  const balance = data?.balance || "-";
  const txCount = data?.txCount || "-";

  el.innerHTML = `
    <div class="card">
      <div class="row">
        <div class="label">Wallet Address</div>
        <div class="value mono">${address || "-"}</div>
      </div>

      <div class="row">
        <div class="label">Farcaster Username</div>
        <div class="value mono" id="fcUserDetail">-</div>
      </div>

      <div class="row">
        <div class="label">ETH Balance</div>
        <div class="value">${balance}</div>
      </div>

      <div class="row">
        <div class="label">Total Transactions</div>
        <div class="value">${txCount}</div>
      </div>
    </div>
  `;

  if (address) loadFarcasterUsername(address);
}

function renderTxTable(list = []) {
  const el = document.getElementById("txTable");
  if (!el) return;

  const rows = list
    .map(
      (t) => `
    <tr>
      <td>
        <span class="click" data-open="${makeBaseScanUrl(t.hash)}">
          ${shortHex(t.hash)}
        </span>
      </td>
      <td class="small">${ageFromTs(t.timeStamp)}</td>
      <td class="small">${shortHex(t.from)}</td>
      <td class="small">${shortHex(t.to)}</td>
      <td class="small">${formatEth(t.value)}</td>
    </tr>
  `
    )
    .join("");

  el.innerHTML = `
    <table class="tbl">
      <thead>
        <tr>
          <th>Tx</th>
          <th>Age</th>
          <th>From</th>
          <th>To</th>
          <th class="right">Value</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="5" class="muted">No data</td></tr>`}
      </tbody>
    </table>
  `;
}

function renderErc20Table(list = []) {
  const el = document.getElementById("erc20Table");
  if (!el) return;

  const rows = list
    .map(
      (t) => `
    <tr>
      <td>
        <span class="click" data-open="${makeBaseScanUrl(t.hash)}">
          ${shortHex(t.hash)}
        </span>
      </td>
      <td class="small">${ageFromTs(t.timeStamp)}</td>
      <td>${t.tokenSymbol || "-"}</td>
      <td class="small">${shortHex(t.from)}</td>
      <td class="small">${shortHex(t.to)}</td>
      <td class="small right">${formatTokenAmount(t.value, t.tokenDecimal)}</td>
    </tr>
  `
    )
    .join("");

  el.innerHTML = `
    <table class="tbl">
      <thead>
        <tr>
          <th>Tx</th>
          <th>Age</th>
          <th>Token</th>
          <th>From</th>
          <th>To</th>
          <th class="right">Value</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="6" class="muted">No data</td></tr>`}
      </tbody>
    </table>
  `;
}

function renderInternalTable(list = []) {
  const el = document.getElementById("internalTable");
  if (!el) return;

  const rows = list
    .map(
      (t) => `
    <tr>
      <td>
        <span class="click" data-open="${makeBaseScanUrl(t.hash)}">
          ${shortHex(t.hash)}
        </span>
      </td>
      <td class="small">${ageFromTs(t.timeStamp)}</td>
      <td class="small">${shortHex(t.from)}</td>
      <td class="small">${shortHex(t.to)}</td>
      <td class="small right">${formatEth(t.value)}</td>
    </tr>
  `
    )
    .join("");

  el.innerHTML = `
    <table class="tbl">
      <thead>
        <tr>
          <th>Tx</th>
          <th>Age</th>
          <th>From</th>
          <th>To</th>
          <th class="right">Value</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="5" class="muted">No data</td></tr>`}
      </tbody>
    </table>
  `;
}

function renderNftTable(list = []) {
  const el = document.getElementById("nftTable");
  if (!el) return;

  const rows = list
    .map(
      (t) => `
    <tr>
      <td>
        <span class="click" data-open="${makeBaseScanUrl(t.hash)}">
          ${shortHex(t.hash)}
        </span>
      </td>
      <td class="small">${ageFromTs(t.timeStamp)}</td>
      <td class="small">${t.nftStd || "-"}</td>
      <td>${t.tokenName || "-"}</td>
      <td class="small">#${t.tokenID || "-"}</td>
      <td class="small">${shortHex(t.from)}</td>
      <td class="small">${shortHex(t.to)}</td>
    </tr>
  `
    )
    .join("");

  el.innerHTML = `
    <table class="tbl">
      <thead>
        <tr>
          <th>Tx</th>
          <th>Age</th>
          <th>Std</th>
          <th>Name</th>
          <th>ID</th>
          <th>From</th>
          <th>To</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="7" class="muted">No data</td></tr>`}
      </tbody>
    </table>
  `;
}
