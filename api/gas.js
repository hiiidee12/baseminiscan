<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <title>Base Mini Scan</title>
  <meta name="description" content="Fast Base explorer mini app for addresses, transactions, blocks, and gas." />

  <!-- Farcaster Mini App -->
  <meta property="fc:miniapp" content="true" />
  <meta property="fc:miniapp:name" content="Base Mini Scan" />
  <meta property="fc:miniapp:url" content="https://baseminiscan.vercel.app/" />
  <meta property="fc:miniapp:icon" content="https://baseminiscan.vercel.app/assets/icon.png" />
  <meta property="fc:miniapp:image" content="https://baseminiscan.vercel.app/assets/card.png" />
  <meta property="fc:miniapp:button" content="Open Mini App" />

  <!-- Open Graph -->
  <meta property="og:title" content="Base Mini Scan" />
  <meta property="og:description" content="Quick BaseScan lookup on Base Network." />
  <meta property="og:image" content="https://baseminiscan.vercel.app/assets/card.png" />
  <meta property="og:url" content="https://baseminiscan.vercel.app/" />
  <meta property="og:type" content="website" />

  <!-- Twitter / Warpcast -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Base Mini Scan" />
  <meta name="twitter:description" content="Base Network explorer helper" />
  <meta name="twitter:image" content="https://baseminiscan.vercel.app/assets/card.png" />

  <link rel="stylesheet" href="/app.css" />
</head>

<body>
  <div class="wrap" id="wrap">
    <div class="card">

      <!-- Profile -->
      <div class="profile">
        <img id="pfp" class="pfp" alt="pfp" />
        <div>
          <div class="profileTop">
            <b id="fcName">Loading…</b>
            <span class="badge" id="fcFid">FID: -</span>
            <span class="badge" id="neynarScore">Neynar: -</span>
          </div>
          <div class="muted" id="fcUser">@-</div>
        </div>
      </div>

      <h1>Base Mini Scan</h1>

      <!-- Gas Tracker Display -->
      <div id="gasTracker" class="muted" style="margin: 8px 0; text-align: center; font-size: 0.9em; line-height: 1.4;">
        Loading gas prices…
      </div>

      <!-- Search -->
      <div class="row">
        <input
          id="query"
          placeholder="Paste address / tx hash / block number"
          autocomplete="off"
          inputmode="text"
          spellcheck="false"
        />
        <button id="open" type="button">Open</button>
        <button id="fetch" class="secondary" type="button">Fetch</button>
      </div>

      <div class="muted" id="link"></div>

      <!-- Tabs -->
      <div class="row two" style="margin-top: 12px;">
        <button id="tabTx" class="secondary" type="button">Transactions</button>
        <button id="tabErc20" class="secondary" type="button">ERC-20 Transfers</button>
      </div>

      <!-- Output -->
      <div id="output"></div>

      <div class="muted">Farcaster Mini App • Base Network</div>
    </div>
  </div>

  <!-- Scripts -->
  <script type="module" src="/sdk.js"></script>
  <script type="module" src="/app.js"></script>

  <!-- Gas Tracker Logic -->
  <script>
    async function updateGasDisplay() {
      try {
        const res = await fetch('/api/gas');
        const data = await res.json();

        if (data?.safe == null || data?.fast == null || data?.rapid == null) {
          throw new Error('Invalid gas data');
        }

        const safe = Number(data.safe).toFixed(2);
        const fast = Number(data.fast).toFixed(2);
        const rapid = Number(data.rapid).toFixed(2);

        let usdLine = '';
        if (data.ethUsd && data.estimates?.erc20?.safeUsd) {
          const safeUsd = data.estimates.erc20.safeUsd.toFixed(4);
          usdLine = ` • ERC-20: ~$${safeUsd}`;
        }

        document.getElementById('gasTracker').innerHTML = `
          Gas (Gwei): Safe ${safe} • Fast ${fast} • Rapid ${rapid}${usdLine}
        `;
      } catch (e) {
        document.getElementById('gasTracker').textContent = 'Gas: —';
      }
    }

    // Load gas on startup
    updateGasDisplay();
    // Refresh every 12 seconds
    setInterval(updateGasDisplay, 12000);
  </script>
</body>
</html>
