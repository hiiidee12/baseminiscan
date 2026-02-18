let __aiMessages = [];
let __aiBusy = false;

function __aiEscape(s) {
  return String(s || "")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">");
}

function __aiRender() {
  const el = document.getElementById("aiChat");
  if (!el) return;

  el.innerHTML = __aiMessages
    .map(
      (m) => `
    <div class="aiMsg ${m.role}">
      <div class="aiBubble">${__aiEscape(m.text)}</div>
    </div>
  `
    )
    .join("");

  el.scrollTop = el.scrollHeight;
}

function __aiAdd(role, text) {
  __aiMessages.push({ role, text });
  __aiRender();
}

function __extractAddress(text) {
  const m = String(text || "").match(/0x[a-fA-F0-9]{40}/);
  return m ? m[0] : null;
}

function __pickBalanceWei(j) {
  return j?.balanceWei ?? j?.balance ?? j?.result?.balanceWei ?? j?.result?.balance ?? null;
}

function __pickTxCount(j) {
  return j?.txCount ?? j?.totalTx ?? j?.result?.txCount ?? j?.result?.totalTx ?? null;
}

async function __fetchExplorerContext(address) {
  try {
    const [addrRes, fcRes] = await Promise.allSettled([
      fetch(`/api/address?address=${encodeURIComponent(address)}&tab=tx`, { cache: "no-store" }),
      fetch(`/api/farcaster?address=${encodeURIComponent(address)}`, { cache: "no-store" }),
    ]);

    let addrJson = null;
    if (addrRes.status === "fulfilled") {
      addrJson = await addrRes.value.json().catch(() => null);
      if (!addrRes.value.ok) addrJson = null;
      if (addrJson?.error) addrJson = null;
    }

    let fcJson = null;
    if (fcRes.status === "fulfilled") {
      fcJson = await fcRes.value.json().catch(() => null);
      if (!fcRes.value.ok) fcJson = null;
      if (fcJson && fcJson.ok !== true) fcJson = null;
    }

    const list = Array.isArray(addrJson?.list) ? addrJson.list.slice(0, 20) : [];

    return {
      address,
      balanceWei: __pickBalanceWei(addrJson),
      txCount: __pickTxCount(addrJson),
      sampleTx: list.map((x) => ({
        timeStamp: x.timeStamp,
        from: x.from,
        to: x.to,
        value: x.value,
        hash: x.hash,
      })),
      farcasterUsername: fcJson?.username ?? null,
      neynarScore: fcJson?.neynarScore ?? null,
    };
  } catch {
    return { address };
  }
}

async function __fetchCoinGeckoContext(text) {
  try {
    const q = String(text || "").toLowerCase();

    const wantGlobal =
      q.includes("market") ||
      q.includes("dominance") ||
      q.includes("btc dominance") ||
      q.includes("total market");

    const wantPrice =
      q.includes("harga") ||
      q.includes("price") ||
      q.includes("berapa") ||
      q.includes("$") ||
      q.includes("usd") ||
      q.includes("idr");

    const jobs = [];

    if (wantPrice) {
      jobs.push(
        fetch(
          `/api/coingecko?endpoint=simple_price&ids=bitcoin,ethereum&vs_currencies=usd,idr&include_24hr_change=1&include_market_cap=1&include_24hr_vol=1`,
          { cache: "no-store" }
        )
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      );
    } else {
      jobs.push(Promise.resolve(null));
    }

    if (wantGlobal) {
      jobs.push(
        fetch(`/api/coingecko?endpoint=global`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      );
    } else {
      jobs.push(Promise.resolve(null));
    }

    const [price, global] = await Promise.all(jobs);

    if (!price && !global) return null;

    return { price, global };
  } catch {
    return null;
  }
}

async function __aiSendNow() {
  if (__aiBusy) return;

  const input = document.getElementById("aiInput");
  const btn = document.getElementById("aiSend");
  if (!input) return;

  const text = (input.value || "").trim();
  if (!text) return;

  input.value = "";
  __aiAdd("user", text);

  __aiBusy = true;
  if (btn) btn.disabled = true;
  input.disabled = true;

  const thinkingIndex = __aiMessages.length;
  __aiMessages.push({ role: "assistant", text: "Thinking..." });
  __aiRender();

  const address = __extractAddress(text);
  const context = address ? await __fetchExplorerContext(address) : null;
  const coingecko = await __fetchCoinGeckoContext(text);

  const history = __aiMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-10)
    .map((m) => ({ role: m.role, text: m.text }));

  try {
    const r = await fetch("/api/ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, context, coingecko, history }),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.ok) throw j;

    __aiMessages[thinkingIndex] = {
      role: "assistant",
      text: String(j.reply || "Data not available.").trim(),
    };
    __aiRender();
  } catch {
    __aiMessages[thinkingIndex] = {
      role: "assistant",
      text: "Failed to generate. Try again.",
    };
    __aiRender();
  } finally {
    __aiBusy = false;
    if (btn) btn.disabled = false;
    input.disabled = false;
    input.focus();
  }
}

function __aiSetActiveTopTab(page) {
  const a = document.getElementById("tabHomeTop");
  const b = document.getElementById("tabAiTop");
  if (!a || !b) return;

  if (page === "ai") {
    b.classList.remove("secondary");
    a.classList.add("secondary");
  } else {
    a.classList.remove("secondary");
    b.classList.add("secondary");
  }
}

window.__aiUi = {
  render: __aiRender,
  add: __aiAdd,
  setActiveTopTab: __aiSetActiveTopTab,
};

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("aiSend")?.addEventListener("click", __aiSendNow);
  document.getElementById("aiInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") __aiSendNow();
  });

  if (__aiMessages.length === 0) {
  __aiAdd(
    "assistant",
    "Commands:\nscan 0x... → wallet analysis\nsearch 0x... → address, token, or tx"
  );
  }
});
