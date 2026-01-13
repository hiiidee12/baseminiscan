let __aiMessages = [];
let __aiBusy = false;

function __aiEscape(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

async function __fetchExplorerContext(address) {
  try {
    const r = await fetch(
      `/api/address?address=${encodeURIComponent(address)}&tab=tx`,
      { cache: "no-store" }
    );
    const j = await r.json();
    if (!r.ok || j?.error) return null;

    const list = Array.isArray(j.list) ? j.list.slice(0, 25) : [];

    return {
      address,
      balanceWei: j.balanceWei ?? null,
      txCount: getTxCountValue(j),
      sampleTx: list.map((x) => ({
        timeStamp: x.timeStamp,
        from: x.from,
        to: x.to,
        value: x.value,
        hash: x.hash,
      })),
    };
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

  const history = __aiMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-10)
    .map((m) => ({ role: m.role, text: m.text }));

  try {
    const r = await fetch("/api/ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        context,
        history,
      }),
    });

    const j = await r.json();
    if (!r.ok || !j?.ok) throw j;

    __aiMessages[thinkingIndex] = { role: "assistant", text: j.reply || "—" };
    __aiRender();
  } catch (e) {
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
      "Paste an address + your question. I will analyze it using explorer data."
    );
  }
});
```0
