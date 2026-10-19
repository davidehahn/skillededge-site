/* /chatbot page script. No framework, no build step.
   Everything it shows comes from /chatbot/content.json (see HOW-TO-EDIT.md).
   The demo bot answers in the browser by matching questions against the FAQ
   lists in content.json. Order of checks: length/limit -> emergency words ->
   repair/diagnosis refusal -> FAQ match -> fallback (callback/contact). */
(function () {
  'use strict';
  var C = null;
  var $ = function (id) { return document.getElementById(id); };

  function get(path) {
    return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, C);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function safeUrl(u, allowMailto) {
    if (typeof u !== 'string') return '';
    u = u.trim();
    if (/^https:\/\//i.test(u)) return u;
    if (allowMailto && /^mailto:/i.test(u)) return u;
    return '';
  }

  /* ---------------- page rendering ---------------- */
  function renderPage() {
    var P = C.page, S = C.settings;
    if (P.title) document.title = P.title;
    var md = document.querySelector('meta[name="description"]');
    if (md && P.metaDescription) md.setAttribute('content', P.metaDescription);

    document.querySelectorAll('[data-c]').forEach(function (n) {
      var v = get(n.getAttribute('data-c'));
      if (typeof v === 'string') n.textContent = v;
    });

    var steps = $('steps');
    (P.steps.items || []).forEach(function (s, i) {
      var li = el('li', 'card');
      li.appendChild(el('div', 'num', 'STEP ' + (i + 1)));
      li.appendChild(el('h3', null, s.title));
      li.appendChild(el('p', null, s.text));
      steps.appendChild(li);
    });

    (P.included.included || []).forEach(function (t) { $('inc-yes').appendChild(el('li', null, t)); });
    (P.included.notIncluded || []).forEach(function (t) { $('inc-no').appendChild(el('li', null, t)); });
    (P.pricing.points || []).forEach(function (t) { $('price-points').appendChild(el('li', null, t)); });

    (P.safety.items || []).forEach(function (s) {
      var d = el('div', 'card');
      d.appendChild(el('h3', null, s.title));
      d.appendChild(el('p', null, s.text));
      $('safety-items').appendChild(d);
    });

    (C.bot.salesFaq || []).filter(function (f) { return f.showOnPage; }).forEach(function (f) {
      var d = el('details'), s = el('summary', null, f.q);
      d.appendChild(s); d.appendChild(el('p', null, f.a));
      $('faq-list').appendChild(d);
    });

    // Stripe button
    var buy = $('buy-btn'), link = safeUrl(S.stripePaymentLink);
    if (link) {
      buy.href = link; buy.textContent = P.pricing.buyButton;
      buy.rel = 'noopener'; $('buy-under').textContent = P.pricing.underButton;
    } else {
      buy.href = '#free-demo'; buy.textContent = P.pricing.buyButtonComingSoon;
      $('buy-under').textContent = P.pricing.underButtonComingSoon;
    }

    // Footer email
    if (S.contactEmail) { var fe = $('footer-email'); fe.href = 'mailto:' + S.contactEmail; fe.textContent = S.contactEmail; }

    renderVideo();
  }

  function loomEmbed(url) {
    var u = safeUrl(url);
    var m = u.match(/^https:\/\/(www\.)?loom\.com\/(share|embed)\/([a-zA-Z0-9]+)/);
    if (!m) return '';
    return 'https://www.loom.com/embed/' + m[3] + '?hide_owner=true&hide_share=true&hide_title=true&hideEmbedTopBar=true';
  }
  function renderVideo() {
    var slot = $('video-slot'), V = C.page.video, src = loomEmbed(C.settings.loomUrl);
    if (!src) {
      var card = el('div', 'video-soon');
      card.setAttribute('role', 'note');
      var play = el('div', 'play', '▶'); play.setAttribute('aria-hidden', 'true');
      card.appendChild(play);
      card.appendChild(el('h3', null, V.comingSoonTitle));
      card.appendChild(el('p', null, V.comingSoonText));
      slot.appendChild(card);
      return;
    }
    // Click-to-load so the Loom player doesn't slow down the page on phones.
    var wrap = el('div', 'video-wrap'), btn = el('button', null, '▶  Play the walkthrough video');
    btn.type = 'button';
    btn.addEventListener('click', function () {
      var f = document.createElement('iframe');
      f.src = src + '&autoplay=1'; f.title = V.title || 'Walkthrough video';
      f.loading = 'lazy'; f.allow = 'autoplay; fullscreen'; f.setAttribute('allowfullscreen', '');
      wrap.replaceChild(f, btn); f.focus();
    });
    wrap.appendChild(btn); slot.appendChild(wrap);
  }

  /* ---------------- free demo form (mailto, nothing stored) ---------------- */
  function setupFreeDemo() {
    var f = $('fd-form'), msg = $('fd-msg'), t0 = Date.now();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if ($('fd-hp').value || Date.now() - t0 < 2000) { msg.textContent = 'Thanks!'; return; } // spam trap
      var v = function (id) { return $(id).value.trim(); };
      if (!v('fd-name') || !v('fd-biz') || !v('fd-url') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('fd-email'))) {
        msg.className = 'form-msg err'; msg.textContent = 'Please fill in your name, business name, website and a valid email.'; return;
      }
      var body = 'Please build a free chat assistant demo for my website.\n\n' +
        'Name: ' + v('fd-name') + '\nBusiness: ' + v('fd-biz') + '\nWebsite: ' + v('fd-url') +
        '\nEmail: ' + v('fd-email') + '\nPhone: ' + (v('fd-phone') || '-') + '\nTrade: ' + $('fd-trade').value + '\n';
      var href = 'mailto:' + C.settings.contactEmail + '?subject=' + encodeURIComponent('Free chatbot demo request: ' + v('fd-biz')) +
        '&body=' + encodeURIComponent(body);
      msg.className = 'form-msg ok';
      msg.textContent = 'Opening your email app… If nothing opens, email ' + C.settings.contactEmail + ' with your website.';
      window.location.href = href;
    });
  }

  /* ---------------- demo bot ---------------- */
  var STOP = ('a an the is are am was be do does did can could would should will i me my we you your it its this that ' +
    'of to for in on at with and or if what whats how who when where which there their they them about any some so just ' +
    'please tell us our have has get got like').split(' ');
  var SYN = {};
  function norm(s) { return (' ' + String(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9$\/]+/g, ' ') + ' ').replace(/\s+/g, ' '); }
  function stem(w) { return w.length > 4 ? w.replace(/(ing|ed|es|s|e)$/, '') : w; }
  function tokens(s) {
    return norm(s).trim().split(' ').filter(function (w) { return w && STOP.indexOf(w) < 0; })
      .map(function (w) { return SYN[w] || w; }).map(stem);
  }
  function tokMatch(a, b) { return a === b || (a.length >= 4 && b.length >= 4 && (a.indexOf(b) === 0 || b.indexOf(a) === 0)); }
  function score(query, item) {
    var qn = norm(query), qt = tokens(query), sc = 0;
    (item.keywords || []).forEach(function (k) {
      var kn = norm(k);
      if (qn.indexOf(kn) >= 0) { sc += 4 + kn.trim().split(' ').length; return; }   // exact phrase
      var kt = tokens(k);
      if (kt.length && kt.every(function (t) { return qt.some(function (q) { return tokMatch(q, t); }); })) sc += 2 + kt.length;
    });
    tokens(item.q).forEach(function (t) { if (qt.some(function (q) { return tokMatch(q, t); })) sc += 1; });
    return sc;
  }
  function bestMatch(query, list) {
    var best = null, bs = 0;
    (list || []).forEach(function (it) { var s = score(query, it); if (s > bs) { bs = s; best = it; } });
    return bs >= 3 ? best : null;
  }
  function anyRegex(text, pats) {
    return (pats || []).some(function (p) { try { return new RegExp(p, 'i').test(text); } catch (e) { return false; } });
  }

  var mode = 'sales', sent = 0, lastAt = 0, B;
  function bot() { return mode === 'sales' ? B.sales : B.sampleShop; }

  function addMsg(role, text, cls) {
    var m = el('div', 'msg ' + (role === 'me' ? 'me' : 'bot') + (cls ? ' ' + cls : ''), text);
    $('chat-log').appendChild(m);
    $('chat-log').scrollTop = $('chat-log').scrollHeight;
    return m;
  }
  function addActions(m, ctas) {
    if (!ctas || !ctas.length) return;
    var box = el('div', 'msg-actions');
    ctas.forEach(function (c) {
      var a;
      if (c === 'checkout') {
        var link = safeUrl(C.settings.stripePaymentLink);
        a = el('a', 'primary', link ? 'Get started' : 'Checkout opening soon');
        a.href = link || '#pricing';
      } else if (c === 'demo') {
        a = el('a', null, 'Free demo'); a.href = '#free-demo';
      } else if (c === 'callback') {
        a = el('button', null, B.sampleShop.callbackButton); a.type = 'button';
        a.addEventListener('click', function () { a.disabled = true; showCallbackForm(); });
      }
      if (a) box.appendChild(a);
    });
    m.appendChild(box);
  }
  function showCallbackForm() {
    var m = addMsg('bot', 'Leave your details and the team will call you back. (Demo: nothing is sent.)');
    var f = el('form', 'cb-form'), id = 'cb' + Date.now();
    [['Name', 'text', 'name'], ['Phone', 'tel', 'tel'], ['What do you need?', 'text', 'off']].forEach(function (x, i) {
      var l = el('label', null, x[0]), inp = el('input'); inp.type = x[1]; inp.id = id + i; inp.autocomplete = x[2];
      inp.maxLength = 120; l.htmlFor = inp.id; f.appendChild(l); f.appendChild(inp);
    });
    var b = el('button', 'btn-send', 'Send request'); b.type = 'submit'; f.appendChild(b);
    f.addEventListener('submit', function (e) {
      e.preventDefault(); f.remove(); addMsg('bot', B.sampleShop.callbackDone);
    });
    m.appendChild(f);
    f.querySelector('input').focus();
  }

  function answer(text) {
    var bt = bot(), shopPhone = B.sampleShop.phone;
    // 1) Emergency words: fixed message, checked before anything else.
    if (anyRegex(text, B.emergency.patterns)) {
      var em = B.emergency.message.replace('{phone}', mode === 'sales' ? B.sampleShop.name + ' at ' + shopPhone : shopPhone);
      if (mode === 'sales') addMsg('bot', B.sales.emergencyIntro);
      addMsg('bot', em, 'alert');
      return;
    }
    // 2) Diagnosis / repair how-to requests are refused.
    if (anyRegex(text, B.repairPatterns)) {
      var r = addMsg('bot', bt.repairRefusal);
      if (mode === 'shop') addActions(r, ['callback']);
      return;
    }
    // 3) Approved answers only.
    var hit = bestMatch(text, mode === 'sales' ? B.salesFaq : B.sampleShopFaq);
    if (hit) {
      var m = addMsg('bot', hit.a);
      addActions(m, mode === 'sales' ? hit.cta : (hit.callback ? ['callback'] : null));
      return;
    }
    // 4) No approved answer: never guess, offer contact/callback.
    var f = addMsg('bot', bt.fallback);
    addActions(f, mode === 'sales' ? ['demo'] : ['callback']);
  }

  function ask(text) {
    var S = C.settings, max = S.maxMessageLength || 400, inp = $('chat-input');
    text = String(text || '').trim();
    if (!text) return;
    if (text.length > max) { $('chat-count').textContent = B.tooLong.replace('{max}', max); return; }
    if (sent >= (S.maxMessagesPerVisit || 30)) { $('chat-count').textContent = B.limitReached; return; }
    var now = Date.now(); if (now - lastAt < 600) return; lastAt = now;
    sent++; $('chat-count').textContent = '';
    addMsg('me', text); inp.value = '';
    setTimeout(function () { answer(text); }, 250);
  }

  function setMode(m) {
    mode = m;
    $('mode-sales').setAttribute('aria-pressed', String(m === 'sales'));
    $('mode-shop').setAttribute('aria-pressed', String(m === 'shop'));
    var bt = bot();
    $('bot-name').textContent = bt.name; $('bot-tag').textContent = bt.tag;
    var fic = $('chat-fictional');
    if (m === 'shop') { fic.textContent = B.sampleShop.fictionalNotice; fic.hidden = false; } else { fic.hidden = true; }
    $('chat-log').innerHTML = '';
    addMsg('bot', bt.greeting);
    var chips = $('chat-chips'); chips.innerHTML = '';
    (bt.chips || []).forEach(function (q) {
      var c = el('button', 'chip', q); c.type = 'button';
      c.addEventListener('click', function () { ask(q); });
      chips.appendChild(c);
    });
  }

  function setupBot() {
    B = C.bot;
    Object.keys(B.synonyms || {}).forEach(function (canon) {
      if (canon.charAt(0) === '_') return;
      (B.synonyms[canon] || []).forEach(function (w) { SYN[w] = canon; });
    });
    $('chat-input').maxLength = C.settings.maxMessageLength || 400;
    $('chat-form').addEventListener('submit', function (e) { e.preventDefault(); ask($('chat-input').value); });
    $('mode-sales').addEventListener('click', function () { setMode('sales'); });
    $('mode-shop').addEventListener('click', function () { setMode('shop'); });
    setMode('sales');
  }

  // exposed for automated tests only
  window.__chatbotDemo = { ask: function (t) { ask(t); }, setMode: setMode };

  fetch('/chatbot/content.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (json) {
      C = json; renderPage(); setupFreeDemo(); setupBot();
      document.documentElement.setAttribute('data-content', 'loaded');
    })
    .catch(function (err) {
      console.error('content.json failed to load', err);
      $('load-error').hidden = false;
      document.documentElement.setAttribute('data-content', 'error');
    });
})();
