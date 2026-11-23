import { auth, json, fail, spent, capUSD } from "./_lib.mjs";

export async function POST(request) {
  const who = auth(request);
  if (!who) return fail("bad_code", "That beta code isn't recognised. Check it with the person who invited you.", 401);
  let usage = null;
  try { usage = { spent: Number((await spent(who.uid)).toFixed(2)), cap: capUSD() }; } catch { }
  return json({ ok: true, name: who.name, uid: who.uid, usage });
}
