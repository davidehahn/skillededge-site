/* Report Engine beta: hosted shim.
   Gives the app the same claude.use(...) calls it has inside claude.ai (db, sample, user, downloads),
   backed by this site's own /api routes. A beta user signs in with the code they were given; no Claude account needed. */
(function () {
  "use strict";
  var KEY = "re.beta";
  var code = null, me = null, resolveReady;
  var ready = new Promise(function (r) { resolveReady = r; });
  try { code = localStorage.getItem(KEY); } catch (e) { }

  function headers(extra) { var h = { "x-beta-code": code || "" }; for (var k in extra || {}) h[k] = extra[k]; return h; }
  async function errFrom(r) { var b = null; try { b = await r.json(); } catch (e) { } var er = (b && b.error) || {}; if (r.status === 401) showLogin("Your sign-in ended. Enter your beta code again."); return { code: er.code || (r.status === 429 ? "rate_limited" : "upstream_error"), message: er.message || "" }; }

  /* ---------- sign-in screen ---------- */
  var css = "#reLogin{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;background:var(--bg,#eef1f5)}" +
    "#reLogin .card{width:100%;max-width:420px;background:var(--panel,#fff);color:var(--ink,#152231);border:1px solid var(--line,#d9e0e8);border-radius:14px;padding:28px;box-shadow:0 4px 24px rgba(20,34,49,.10)}" +
    "#reLogin h1{font:700 22px/1.2 Archivo,system-ui,sans-serif;margin:0 0 6px}#reLogin p{margin:0 0 16px;color:var(--muted,#5a6879);font-size:14px}" +
    "#reLogin input{width:100%;font:500 16px/1.2 'IBM Plex Mono',ui-monospace,monospace;padding:12px;border:1px solid var(--line,#d9e0e8);border-radius:10px;background:var(--panel-2,#f6f8fb);color:inherit}" +
    "#reLogin button{margin-top:12px;width:100%;padding:12px;border:0;border-radius:10px;background:var(--accent,#c96f0a);color:#fff;font:600 16px/1 'IBM Plex Sans',system-ui,sans-serif;cursor:pointer}" +
    "#reLogin button:disabled{opacity:.6;cursor:wait}#reLogin .err{color:var(--bad,#b42318);font-size:14px;margin-top:10px;min-height:1em}";
  function showLogin(msg) {
    if (document.getElementById("reLogin")) { var e0 = document.querySelector("#reLogin .err"); if (e0 && msg) e0.textContent = msg; return; }
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    var d = document.createElement("div"); d.id = "reLogin"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-labelledby", "reLoginT");
    d.innerHTML = '<form class="card" novalidate><h1 id="reLoginT">Report Engine</h1><p>Free beta. Enter the beta code you were given. Your jobs save to your account here and you can pick them up on any device with the same code.</p>' +
      '<label for="reCode" style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">Beta code</label><input id="reCode" autocomplete="off" autocapitalize="off" spellcheck="false" required>' +
      '<button type="submit">Sign in</button><div class="err" role="alert"></div></form>';
    (document.body || document.documentElement).appendChild(d);
    var f = d.querySelector("form"), inp = d.querySelector("#reCode"), btn = d.querySelector("button"), err = d.querySelector(".err");
    if (msg) err.textContent = msg;
    setTimeout(function () { inp.focus(); }, 30);
    f.addEventListener("submit", async function (ev) {
      ev.preventDefault(); var c = inp.value.trim(); if (!c) { err.textContent = "Enter your beta code."; return; }
      btn.disabled = true; err.textContent = "";
      var ok = await signIn(c);
      btn.disabled = false;
      if (!ok) err.textContent = "That code isn't recognised. Check it with the person who invited you.";
    });
  }
  async function signIn(c) {
    try {
      var r = await fetch("/api/report-engine/login", { method: "POST", headers: { "x-beta-code": c } });
      if (!r.ok) return false;
      var b = await r.json(); code = c; me = { uid: b.uid, name: b.name, usage: b.usage };
      try { localStorage.setItem(KEY, c); } catch (e) { }
      var d = document.getElementById("reLogin"); if (d) d.remove();
      resolveReady(); return true;
    } catch (e) { return false; }
  }
  function boot() { if (code) signIn(code).then(function (ok) { if (!ok) showLogin(); }); else showLogin(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

  /* ---------- db ---------- */
  function collection(path) {
    return {
      get: async function () {
        var r = await fetch("/api/report-engine/db?coll=" + encodeURIComponent(path), { headers: headers() });
        if (!r.ok) throw await errFrom(r);
        var b = await r.json();
        return { docs: (b.docs || []).map(function (d) { return { id: d.id, data: function () { return d.data; } }; }) };
      },
      doc: function (id) {
        var p = "/api/report-engine/db?doc=" + encodeURIComponent(path + "/" + id);
        return {
          set: async function (v) { var r = await fetch(p, { method: "PUT", headers: headers({ "content-type": "application/json" }), body: JSON.stringify(v) }); if (!r.ok) throw await errFrom(r); },
          delete: async function () { var r = await fetch(p, { method: "DELETE", headers: headers() }); if (!r.ok) throw await errFrom(r); },
          get: async function () { var all = await collection(path).get(); var d = all.docs.find(function (x) { return x.id === id; }); return { exists: !!d, data: function () { return d ? d.data() : undefined; } }; }
        };
      }
    };
  }
  var db = { collection: collection, doc: function (p) { var i = p.lastIndexOf("/"); return collection(p.slice(0, i)).doc(p.slice(i + 1)); } };

  /* ---------- sample (Claude via /api/sample) ---------- */
  function toJpegB64(blob) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(blob), im = new Image();
      im.onload = function () {
        URL.revokeObjectURL(u); var k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
        var cv = document.createElement("canvas"); cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
        cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
        res({ media_type: "image/jpeg", data: cv.toDataURL("image/jpeg", 0.82).split(",")[1] });
      };
      im.onerror = function () { URL.revokeObjectURL(u); rej({ code: "image_rejected" }); };
      im.src = u;
    });
  }
  async function run(input, opts, asJson) {
    opts = opts || {};
    var images = opts.images && opts.images.length ? await Promise.all(Array.prototype.map.call(opts.images, toJpegB64)) : undefined;
    var r;
    try { r = await fetch("/api/report-engine/sample", { method: "POST", headers: headers({ "content-type": "application/json" }), body: JSON.stringify({ input: input, tier: opts.modelTier || "default", json: !!asJson, images: images }), signal: opts.signal }); }
    catch (e) { throw (opts.signal && opts.signal.aborted) ? { code: "cancelled" } : { code: "upstream_error", message: "Can't reach the server. Check your connection, then try again." }; }
    if (!r.ok) throw await errFrom(r);
    var reader = r.body.getReader(), dec = new TextDecoder(), buf = "", text = "", truncated = false, done = false;
    try {
      while (true) {
        var ch = await reader.read(); if (ch.done) break;
        buf += dec.decode(ch.value, { stream: true });
        var lines = buf.split("\n"); buf = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          if (!lines[i].trim()) continue; var m = JSON.parse(lines[i]);
          if (m.t) { text += m.t; if (opts.onText) try { opts.onText({ text: text, delta: m.t }); } catch (e) { } }
          if (m.error) throw { code: m.error.code || "upstream_error", message: m.error.message || "", text: text };
          if (m.done) { done = true; truncated = !!m.truncated; }
        }
      }
    } catch (e) { if (opts.signal && opts.signal.aborted) throw { code: "cancelled" }; if (e && e.code) throw e; throw { code: "upstream_error", text: text }; }
    if (!done) throw { code: "upstream_error", message: "The connection dropped before Claude finished. Try again.", text: text };
    if (!text.trim()) throw { code: "empty_completion" };
    return { text: text, truncated: truncated };
  }
  function parseJSON(t) {
    var s = String(t).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try { return JSON.parse(s); } catch (e) { }
    var a = s.search(/[\[{]/), b = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
    if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { } }
    throw { code: "invalid_json", text: t };
  }
  var sample = function (input, opts) { return run(input, opts, false); };
  sample.json = async function (input, opts) { var r = await run(input, opts, true); return parseJSON(r.text); };
  sample.limits = async function () { return { images: true }; };

  /* ---------- user, downloads ---------- */
  var user = {
    id: async function () { return me && me.uid; },
    me: async function () { return { id: me && me.uid, name: (me && me.name) || "" }; },
    isOwner: function () { return false; }, canEdit: function () { return false; }, can: function () { return null; },
    profiles: async function () { return {}; }
  };
  var downloads = {
    save: async function (o) {
      var a = document.createElement("a"); var u = URL.createObjectURL(o.data instanceof Blob ? o.data : new Blob([o.data]));
      a.href = u; a.download = o.filename || "download"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
    }
  };

  var impl = { db: db, sample: sample, user: user, downloads: downloads };
  window.RE_HOST = {
    hosted: true,
    name: function () { return (me && me.name) || ""; },
    usage: function () { return me && me.usage; },
    signOut: function () { try { localStorage.removeItem(KEY); } catch (e) { } location.reload(); }
  };
  window.claude = { use: async function (name) { await ready; return impl[name] || null; } };
})();
