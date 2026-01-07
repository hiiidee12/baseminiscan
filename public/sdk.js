import sdk from "https://esm.sh/@farcaster/miniapp-sdk";

window.__fcSdk = sdk;

let resolveReady, rejectReady;
window.__fcSdkReady = new Promise((res, rej) => {
  resolveReady = res;
  rejectReady = rej;
});

async function loadNeynarScore(fid) {
  const el = document.getElementById("neynarScore");
  if (!el || !fid) return;

  try {
    const r = await fetch(`/api/neynar?fid=${encodeURIComponent(fid)}`);
    const j = await r.json();
    if (!r.ok || j?.error) {
      el.textContent = "Neynar: -";
      return;
    }
    el.textContent =
      typeof j.score === "number"
        ? `Neynar: ${j.score.toFixed(2)}`
        : "Neynar: -";
  } catch {
    el.textContent = "Neynar: -";
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  try {
    if (sdk.actions?.ready) await sdk.actions.ready();

    const inMiniApp = await sdk.isInMiniApp();
    if (!inMiniApp) {
      const el = document.getElementById("fcName");
      if (el) el.textContent = "Open in Farcaster client";
      resolveReady(false);
      return;
    }

    const ctx = await sdk.context;
    const u = ctx?.user || {};

    const setText = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    const setImg = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.src = v || "";
    };

    setText("fcName", u.displayName || "Farcaster User");
    setText("fcUser", u.username ? `@${u.username}` : "@-");
    setText("fcFid", `FID: ${u.fid ?? "-"}`);
    setImg("pfp", u.pfpUrl);

    if (u.fid) loadNeynarScore(u.fid);

    const ins = ctx?.client?.safeAreaInsets;
    if (ins) {
      const wrap = document.getElementById("wrap");
      if (wrap) {
        wrap.style.paddingTop = `calc(16px + ${ins.top || 0}px)`;
        wrap.style.paddingBottom = `calc(16px + ${ins.bottom || 0}px)`;
      }
    }

    resolveReady(true);
  } catch (e) {
    rejectReady(e);
  }
});
