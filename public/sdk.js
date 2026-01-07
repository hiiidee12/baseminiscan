import { sdk } from "https://esm.sh/@farcaster/miniapp-sdk";

window.__fcSdk = sdk;

async function loadNeynarScore(fid) {
  const el = document.getElementById("neynarScore");
  if (!el || !fid) return;

  try {
    const res = await fetch(`/api/neynar?fid=${encodeURIComponent(fid)}`);
    const json = await res.json();

    if (!res.ok || json?.error) {
      el.textContent = "Neynar: -";
      return;
    }

    const s = json?.score;
    el.textContent = typeof s === "number" ? `Neynar: ${s.toFixed(2)}` : "Neynar: -";
  } catch (e) {
    el.textContent = "Neynar: -";
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  try {
    const inMiniApp = await sdk.isInMiniApp();

    if (!inMiniApp) {
      const nameEl = document.getElementById("fcName");
      if (nameEl) nameEl.textContent = "Open in Farcaster client";
      return;
    }

    await sdk.actions.ready();

    const ctx = await sdk.context;
    const u = ctx?.user || {};

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    const setImg = (id, src) => {
      const el = document.getElementById(id);
      if (el) el.src = src || "";
    };

    setText("fcName", u.displayName || "Farcaster User");
    setText("fcUser", u.username ? `@${u.username}` : "@-");
    setText("fcFid", u.fid ? `FID: ${u.fid}` : "FID: -");
    setImg("pfp", u.pfpUrl || "");

    if (u.fid) loadNeynarScore(u.fid);

    const insets = ctx?.client?.safeAreaInsets;
    if (insets) {
      const wrap = document.getElementById("wrap");
      if (wrap) {
        wrap.style.paddingTop = `calc(16px + ${insets.top || 0}px)`;
        wrap.style.paddingBottom = `calc(16px + ${insets.bottom || 0}px)`;
      }
    }
  } catch (err) {
    console.warn("MiniApp SDK error:", err);
  }
});
