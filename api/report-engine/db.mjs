// Private per-user document store. Paths mirror the claude.ai db layout the app already uses:
// collections "data/users/<uid>" and "data/users/<uid>/photos/<jobId>", documents "<collection>/<id>".
import { auth, json, fail, store } from "./_lib.mjs";

const SAFE = /^[A-Za-z0-9_\-]{1,80}$/;
function check(path, uid, wantDoc) {
  const segs = String(path || "").split("/");
  if (segs.length < 3 || segs[0] !== "data" || segs[1] !== "users" || segs[2] !== uid) return null;
  if (!segs.every(s => SAFE.test(s))) return null;
  const isDoc = segs.length % 2 === 0;
  if (isDoc !== wantDoc) return null;
  return segs.join("/");
}
const key = p => "re:doc:" + p;
const idx = c => "re:idx:" + c;
const MAX = 3_500_000;

export async function GET(request) {
  const who = auth(request); if (!who) return fail("not_signed_in", "Sign in with your beta code.", 401);
  const coll = check(new URL(request.url).searchParams.get("coll"), who.uid, false);
  if (!coll) return fail("bad_path", "Not allowed.", 403);
  try {
    const s = await store();
    const ids = (await s.smembers(idx(coll))) || [];
    const vals = await s.mget(ids.map(id => key(coll + "/" + id)));
    const docs = ids.map((id, i) => ({ id, data: vals[i] == null ? null : (typeof vals[i] === "string" ? JSON.parse(vals[i]) : vals[i]) })).filter(d => d.data != null);
    return json({ docs });
  } catch (e) { return fail(e.code || "storage_error", e.message || "Storage error.", 500); }
}
export async function PUT(request) {
  const who = auth(request); if (!who) return fail("not_signed_in", "Sign in with your beta code.", 401);
  const doc = check(new URL(request.url).searchParams.get("doc"), who.uid, true);
  if (!doc) return fail("bad_path", "Not allowed.", 403);
  const body = await request.text();
  if (body.length > MAX) return fail("too_large", "This item is too large to save.", 413);
  try { JSON.parse(body); } catch { return fail("bad_json", "Not valid JSON.", 400); }
  try {
    const s = await store(); const coll = doc.slice(0, doc.lastIndexOf("/")); const id = doc.slice(doc.lastIndexOf("/") + 1);
    await s.set(key(doc), body); await s.sadd(idx(coll), id);
    return json({ ok: true });
  } catch (e) { return fail(e.code || "storage_error", e.message || "Storage error.", 500); }
}
export async function DELETE(request) {
  const who = auth(request); if (!who) return fail("not_signed_in", "Sign in with your beta code.", 401);
  const doc = check(new URL(request.url).searchParams.get("doc"), who.uid, true);
  if (!doc) return fail("bad_path", "Not allowed.", 403);
  try {
    const s = await store(); const coll = doc.slice(0, doc.lastIndexOf("/")); const id = doc.slice(doc.lastIndexOf("/") + 1);
    await s.del(key(doc)); await s.srem(idx(coll), id);
    return json({ ok: true });
  } catch (e) { return fail(e.code || "storage_error", e.message || "Storage error.", 500); }
}
