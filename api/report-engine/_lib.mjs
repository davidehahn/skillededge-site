// Shared helpers for the Report Engine beta API: beta-code sign-in, private storage, usage cap.
import { createHash } from "node:crypto";

// BETA_CODES is set by the owner in Vercel: "Name One:code-one,Name Two:code-two". Codes are never logged.
export function betaUsers() {
  const out = new Map();
  String(process.env.BETA_CODES || "").split(",").map(s => s.trim()).filter(Boolean).forEach(pair => {
    const i = pair.lastIndexOf(":");
    const name = i > 0 ? pair.slice(0, i).trim() : "Beta user";
    const code = (i > 0 ? pair.slice(i + 1) : pair).trim();
    if (code.length >= 8) out.set(normCode(code), name);
  });
  return out;
}
export const normCode = c => String(c || "").trim().toLowerCase().replace(/\s+/g, "-");
export const uidFor = code => createHash("sha256").update("re-beta:" + normCode(code)).digest("hex").slice(0, 16);

export function auth(request) {
  const code = normCode(request.headers.get("x-beta-code"));
  if (!code) return null;
  const name = betaUsers().get(code);
  if (!name) return null;
  return { uid: uidFor(code), name };
}
export const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
export const fail = (code, message, status) => json({ error: { code, message } }, status);

/* ---------- storage: Upstash Redis or a private Vercel Blob store in production, a local JSON file in development ---------- */
let _store = null;
export async function store() {
  if (_store) return _store;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const { Redis } = await import("@upstash/redis");
    const r = new Redis({ url, token, automaticDeserialization: false });
    _store = {
      async get(k) { return r.get(k); },
      async set(k, v) { await r.set(k, v); },
      async del(k) { await r.del(k); },
      async sadd(k, m) { await r.sadd(k, m); },
      async srem(k, m) { await r.srem(k, m); },
      async smembers(k) { return r.smembers(k); },
      async mget(keys) { return keys.length ? r.mget(...keys) : []; },
      async incrbyfloat(k, n) { return Number(await r.incrbyfloat(k, n)); }
    };
  } else if (process.env.BLOB_READ_WRITE_TOKEN) {
    // Vercel Blob (private store). Each key is one small JSON blob; sets are JSON arrays.
    const B = await import("@vercel/blob");
    const pn = k => "re/" + String(k).replace(/[^A-Za-z0-9_\-:\/]/g, "_").replace(/:/g, "/") + ".json";
    const read = async k => {
      try {
        const r = await B.get(pn(k), { access: "private", useCache: false });
        if (!r || r.statusCode !== 200 || !r.stream) return null;
        return await new Response(r.stream).text();
      } catch (e) { if (e instanceof B.BlobNotFoundError) return null; throw e; }
    };
    const write = (k, v) => B.put(pn(k), String(v), { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json", cacheControlMaxAge: 60 });
    const readSet = async k => { const t = await read(k); try { return t ? JSON.parse(t) : []; } catch { return []; } };
    _store = {
      async get(k) { return read(k); },
      async set(k, v) { await write(k, v); },
      async del(k) { try { await B.del(pn(k)); } catch (e) { if (!(e instanceof B.BlobNotFoundError)) throw e; } },
      async sadd(k, m) { const a = await readSet(k); if (!a.includes(m)) { a.push(m); await write(k, JSON.stringify(a)); } },
      async srem(k, m) { const a = await readSet(k); if (a.includes(m)) await write(k, JSON.stringify(a.filter(x => x !== m))); },
      async smembers(k) { return readSet(k); },
      async mget(keys) { return Promise.all(keys.map(read)); },
      async incrbyfloat(k, n) { const v = Number((await read(k)) || 0) + n; await write(k, String(v)); return v; }
    };
  } else if (process.env.RE_LOCAL_STORE) {
    const fs = await import("node:fs");
    const file = process.env.RE_LOCAL_STORE;
    const load = () => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; } };
    const save = d => fs.writeFileSync(file, JSON.stringify(d));
    _store = {
      async get(k) { return load()[k] ?? null; },
      async set(k, v) { const d = load(); d[k] = v; save(d); },
      async del(k) { const d = load(); delete d[k]; save(d); },
      async sadd(k, m) { const d = load(); d[k] = [...new Set([...(d[k] || []), m])]; save(d); },
      async srem(k, m) { const d = load(); d[k] = (d[k] || []).filter(x => x !== m); save(d); },
      async smembers(k) { return load()[k] || []; },
      async mget(keys) { const d = load(); return keys.map(k => d[k] ?? null); },
      async incrbyfloat(k, n) { const d = load(); d[k] = Number(d[k] || 0) + n; save(d); return d[k]; }
    };
  } else {
    throw Object.assign(new Error("Storage is not set up. Connect a Vercel Blob store (private) or Upstash Redis to this Vercel project."), { code: "storage_missing" });
  }
  return _store;
}

/* ---------- usage cap (rough dollars per beta user per calendar month) ---------- */
const PRICE = { in: 4 / 1e6, out: 20 / 1e6 }; // claude-opus-5-5, $ per token
export const monthKey = uid => `re:usage:${uid}:${new Date().toISOString().slice(0, 7)}`;
export const capUSD = () => Number(process.env.MONTHLY_CAP_USD || 25);
export async function spent(uid) { const s = await store(); return Number((await s.get(monthKey(uid))) || 0); }
export async function addSpend(uid, usage) {
  if (!usage) return;
  const inTok = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) * 1.25 + (usage.cache_read_input_tokens || 0) * 0.1;
  const usd = inTok * PRICE.in + (usage.output_tokens || 0) * PRICE.out;
  const s = await store(); await s.incrbyfloat(monthKey(uid), Number(usd.toFixed(6)));
}
