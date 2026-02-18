const GEMINI_KEYS = [
  process.env.OPENAI_API_KEY,
].filter(Boolean);

let __geminiKeyIndex = 0;

function pickGeminiKey() {
  if (!GEMINI_KEYS.length) return null;
  const k = GEMINI_KEYS[__geminiKeyIndex % GEMINI_KEYS.length];
  __geminiKeyIndex = (__geminiKeyIndex + 1) % GEMINI_KEYS.length;
  return k;
}

export function hasApiKeys() {
  return GEMINI_KEYS.length > 0;
}

export async function callGeminiWithRotation({ model, input, instructions, temperature, maxOutputTokens }) {
  if (!GEMINI_KEYS.length) return { ok: false, status: 0, json: null };

  const url = "https://openrouter.ai/api/v1/chat/completions ";

  let last = { ok: false, status: 0, json: null };

  for (let attempt = 0; attempt < GEMINI_KEYS.length; attempt++) {
    const apiKey = pickGeminiKey();

    const messages = [
      ...(instructions ? [{ role: "system", content: String(instructions) }] : []),
      ...(Array.isArray(input) ? input : []),
    ];

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxOutputTokens,
      }),
    });

    const j = await r.json().catch(() => null);

    if (r.ok) return { ok: true, status: r.status, json: j };

    if (r.status === 429 || r.status === 503) {
      last = { ok: false, status: r.status, json: j };
      continue;
    }

    return { ok: false, status: r.status, json: j };
  }

  return last;
}

export function extractOpenAIText(j) {
  try {
    if (!j || typeof j !== "object") return "";

    const choices = Array.isArray(j.choices) ? j.choices : [];
    if (choices.length) {
      const c0 = choices[0] && typeof choices[0] === "object" ? choices[0] : null;
      const msg = c0 && c0.message && typeof c0.message === "object" ? c0.message : null;
      if (msg && typeof msg.content === "string" && msg.content.trim()) return msg.content.trim();

      const delta = c0 && c0.delta && typeof c0.delta === "object" ? c0.delta : null;
      if (delta && typeof delta.content === "string" && delta.content.trim()) return delta.content.trim();
    }

    if (typeof j.output_text === "string" && j.output_text.trim()) return j.output_text.trim();

    const out = Array.isArray(j.output) ? j.output : [];
    const chunks = [];

    for (const item of out) {
      if (!item || typeof item !== "object") continue;

      if (item.type === "message" && item.role === "assistant") {
        const content = Array.isArray(item.content) ? item.content : [];
        for (const c of content) {
          if (!c || typeof c !== "object") continue;
          if (c.type === "output_text" && typeof c.text === "string") chunks.push(c.text);
          if (c.type === "text" && typeof c.text === "string") chunks.push(c.text);
        }
      }

      if (item.type === "output_text" && typeof item.text === "string") {
        chunks.push(item.text);
      }
    }

    return chunks.join("").trim();
  } catch {
    return "";
  }
}
