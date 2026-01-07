window.__fcSdk = null;

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
    el.textContent =
      typeof s === "number" ? `Neynar: ${s.toFixed(2)}` : "Neynar: -";
  } catch {
    el.textContent = "Neynar: -";
  }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setImg(id, src) {
  const el = document.getElementById(id);
  if (el) el.src = src || "";
}

window.addEventListener("DOMContentLoaded", async () => {
  let sdk = null;

  try {
    const mod = await import("https://esm.sh/@farcaster/miniapp-sdk");
    sdk = mod?.sdk || mod?.default || null;
  } catch {
    sdk = null;
  }

  window.__fcSdk = sdk;

  if (!sdk) {
    setText("fcName", "Open in Farcaster client");
    return;
  }

  try {
    const inMiniApp = await sdk.isInMiniApp();
    if (!inMiniApp) {
      setText("fcName", "Open in Farcaster client");
      return;
    }

    await sdk.actions.ready();

    const ctx = await sdk.context;
    const u = ctx?.user || {};

    setText("fcName", u.displayName || "Farcaster User");
    setText("fcUser", u.username ? `@${u.username}` : "@-");
    setText("fcFid", `FID: ${u.fid ?? "-"}`);
    setImg("pfp", u.pfpUrl || "");

    if (u?.fid) {
      loadNeynarScore(u.fid);
    }

    const insets = ctx?.client?.safeAreaInsets;
    if (insets) {
      const wrap = document.getElementById("wrap");
      if (wrap) {
        wrap.style.paddingTop = `calc(16px + ${insets.top || 0}px)`;
        wrap.style.paddingBottom = `calc(16px + ${insets.bottom || 0}px)`;
      }
    }
  } catch {
    setText("fcName", "Open in Farcaster client");
  }
});
