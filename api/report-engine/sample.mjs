// Claude proxy for the Report Engine beta. The browser never sees the API key.
// Streams newline-delimited JSON: {"t":"<text chunk>"} ... then {"done":true,"truncated":bool} or {"error":{code,message}}.
import Anthropic from "@anthropic-ai/sdk";
import { auth, fail, spent, addSpend, capUSD } from "./_lib.mjs";

const MODEL = process.env.RE_MODEL || "claude-opus-5-5";
const EFFORT = { quick: "low", default: "medium", complex: "high" };
const JSON_SYSTEM = "Reply with only the JSON value the user asks for. No prose before or after it, and no code fences.";
const BASE_SYSTEM = "You are the drafting engine inside a consultant's report-writing app. The consultant reviews, edits, approves and signs every report. Follow the instructions in the user message exactly.";
const IMG_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function toMessages(body) {
  const imgs = Array.isArray(body.images) ? body.images.filter(i => i && IMG_TYPES.has(i.media_type) && typeof i.data === "string").slice(0, 4) : [];
  const msgs = Array.isArray(body.input)
    ? body.input.filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").map(m => ({ role: m.role, content: m.content }))
    : [{ role: "user", content: String(body.input || "") }];
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  if (imgs.length) { const last = msgs[msgs.length - 1]; last.content = [...imgs.map(i => ({ type: "image", source: { type: "base64", media_type: i.media_type, data: i.data } })), { type: "text", text: last.content }]; }
  return msgs;
}
function codeFor(e) {
  const s = e && e.status;
  if (s === 429 || s === 529) return ["rate_limited", "Claude is busy right now. Wait a minute, then try again."];
  if (s === 413 || (s === 400 && /too long|prompt is too long|context/i.test(e.message || ""))) return ["prompt_too_large", ""];
  if (s === 400 && /image/i.test(e.message || "")) return ["image_rejected", ""];
  if (s === 401 || s === 403) return ["sampling_disabled", "The app's Claude connection isn't set up. Tell the person who invited you."];
  return ["upstream_error", ""];
}

export async function POST(request) {
  const who = auth(request);
  if (!who) return fail("session_expired", "Sign in again with your beta code.", 401);
  let body; try { body = await request.json(); } catch { return fail("bad_json", "Bad request.", 400); }
  const messages = toMessages(body); if (!messages) return fail("bad_request", "Bad request.", 400);
  try { if ((await spent(who.uid)) >= capUSD()) return fail("rate_limited", "This beta account reached its monthly usage limit. Tell the person who invited you.", 429); }
  catch (e) { return fail("storage_missing", e.message, 500); }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctl) {
      const send = o => ctl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        if (globalThis.__RE_MOCK) { // local tests only; never set in production
          const text = await globalThis.__RE_MOCK(messages, body);
          for (let i = 0; i < text.length; i += 400) send({ t: text.slice(i, i + 400) });
          send({ done: true, truncated: false }); ctl.close(); return;
        }
        if (!process.env.ANTHROPIC_API_KEY) { send({ error: { code: "sampling_disabled", message: "The app's Claude connection isn't set up yet. Tell the person who invited you." } }); ctl.close(); return; }
        const client = new Anthropic();
        const s = client.messages.stream({
          model: MODEL,
          max_tokens: 32000,
          system: (body.json ? JSON_SYSTEM + " " : "") + BASE_SYSTEM,
          output_config: { effort: EFFORT[body.tier] || "medium" },
          messages
        }, { signal: request.signal });
        for await (const ev of s) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") send({ t: ev.delta.text });
        }
        const msg = await s.finalMessage();
        try { await addSpend(who.uid, msg.usage); } catch { }
        if (msg.stop_reason === "refusal") send({ error: { code: "refused", message: "" } });
        else send({ done: true, truncated: msg.stop_reason === "max_tokens" });
      } catch (e) {
        if (request.signal && request.signal.aborted) { try { ctl.close(); } catch { } return; }
        const [code, message] = codeFor(e); send({ error: { code, message } });
      }
      try { ctl.close(); } catch { }
    }
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
