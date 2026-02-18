import { fmtNum } from "../utils/formatting.js";

export function buildCoinGeckoText(coingecko) {
  try {
    if (!coingecko || typeof coingecko !== "object") return "";

    const price = coingecko.price && typeof coingecko.price === "object" ? coingecko.price : null;
    const global = coingecko.global && typeof coingecko.global === "object" ? coingecko.global : null;

    const lines = [];

    if (price && typeof price === "object") {
      const eth = price.ethereum && typeof price.ethereum === "object" ? price.ethereum : null;
      const btc = price.bitcoin && typeof price.bitcoin === "object" ? price.bitcoin : null;

      if (eth) {
        const ethUsd = fmtNum(eth.usd, 2);
        const ethIdr = fmtNum(eth.idr, 0);
        const ethCh = fmtNum(eth.usd_24h_change, 2);
        const ethMc = fmtNum(eth.usd_market_cap, 0);
        const ethVol = fmtNum(eth.usd_24h_vol, 0);

        const parts = [];
        if (ethUsd !== null) parts.push(`ETH_USD=${ethUsd}`);
        if (ethIdr !== null) parts.push(`ETH_IDR=${ethIdr}`);
        if (ethCh !== null) parts.push(`ETH_24H_CHANGE_PCT=${ethCh}`);
        if (ethMc !== null) parts.push(`ETH_MKTCAP_USD=${ethMc}`);
        if (ethVol !== null) parts.push(`ETH_VOL_24H_USD=${ethVol}`);

        if (parts.length) {
          lines.push("PRICE_DATA");
          lines.push(parts.join(" | "));
        }
      }

      if (btc) {
        const btcUsd = fmtNum(btc.usd, 2);
        const btcIdr = fmtNum(btc.idr, 0);
        const btcCh = fmtNum(btc.usd_24h_change, 2);
        const btcMc = fmtNum(btc.usd_market_cap, 0);
        const btcVol = fmtNum(btc.usd_24h_vol, 0);

        const parts = [];
        if (btcUsd !== null) parts.push(`BTC_USD=${btcUsd}`);
        if (btcIdr !== null) parts.push(`BTC_IDR=${btcIdr}`);
        if (btcCh !== null) parts.push(`BTC_24H_CHANGE_PCT=${btcCh}`);
        if (btcMc !== null) parts.push(`BTC_MKTCAP_USD=${btcMc}`);
        if (btcVol !== null) parts.push(`BTC_VOL_24H_USD=${btcVol}`);

        if (parts.length) {
          if (!lines.length) lines.push("PRICE_DATA");
          lines.push(parts.join(" | "));
        }
      }
    }

    if (global && typeof global === "object") {
      const data = global.data && typeof global.data === "object" ? global.data : null;

      if (data) {
        const tmc = data.total_market_cap && typeof data.total_market_cap === "object" ? data.total_market_cap : null;
        const tv = data.total_volume && typeof data.total_volume === "object" ? data.total_volume : null;
        const mpp = data.market_cap_percentage && typeof data.market_cap_percentage === "object" ? data.market_cap_percentage : null;

        const parts = [];

        if (tmc) {
          const tmcUsd = fmtNum(tmc.usd, 0);
          if (tmcUsd !== null) parts.push(`TOTAL_MKTCAP_USD=${tmcUsd}`);
        }

        if (tv) {
          const tvUsd = fmtNum(tv.usd, 0);
          if (tvUsd !== null) parts.push(`TOTAL_VOL_24H_USD=${tvUsd}`);
        }

        if (mpp) {
          const btcDom = fmtNum(mpp.btc, 2);
          const ethDom = fmtNum(mpp.eth, 2);
          if (btcDom !== null) parts.push(`BTC_DOMINANCE_PCT=${btcDom}`);
          if (ethDom !== null) parts.push(`ETH_DOMINANCE_PCT=${ethDom}`);
        }

        if (parts.length) {
          lines.push("GLOBAL_DATA");
          lines.push(parts.join(" | "));
        }
      }
    }

    if (!lines.length) return "";
    return lines.join("\n");
  } catch {
    return "";
  }
}
