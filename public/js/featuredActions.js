// ============== USD Formatter & Featured Actions ==============

function fmtUSD(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `$${v.toFixed(4)}`;
}

function renderFeaturedActionsCard(data) {
  const list = data?.featuredActions || [];
  const rows = list.map((r) => `
    <tr>
      <td>${r.label}</td>
      <td class="num">${fmtUSD(r.low)}</td>
      <td class="num">${fmtUSD(r.average)}</td>
      <td class="num">${fmtUSD(r.high)}</td>
    </tr>
  `).join("");

  return `
    <div class="card">
      <div class="cardTitle">Featured Actions</div>
      <table class="tbl">
        <thead>
          <tr>
            <th>Action</th>
            <th class="num">Low</th>
            <th class="num">Average</th>
            <th class="num">High</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="4">No data</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

async function loadFeaturedActions() {
  const el = document.getElementById("featuredActions");
  if (!el) return;

  el.innerHTML = `
    <div class="card">
      <div class="cardTitle">Featured Actions</div>
      <div class="muted">Loading...</div>
    </div>
  `;

  try {
    const r = await fetch("/api/featured-actions");
    const j = await r.json();
    el.innerHTML = renderFeaturedActionsCard(j);
  } catch (e) {
    el.innerHTML = `
      <div class="card">
        <div class="cardTitle">Featured Actions</div>
        <div class="muted">Failed to load data!</div>
      </div>
    `;
  }
}

// ===================================================================
