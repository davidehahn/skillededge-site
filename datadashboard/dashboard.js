/* /datadashboard/ sample Business Intelligence Snapshot.
   All sample figures are stored in the inline JSON block (id="snapshot-data") in index.html.
   Every number shown on the page is computed here from that JSON, so totals always tie out.
   No network calls are made at runtime. */
(function (root) {
  'use strict';

  function sum(arr, f) { return arr.reduce(function (a, x) { return a + (f ? f(x) : x); }, 0); }
  function round2(n) { return Math.round(n * 100) / 100; }

  /* ---------- pure computation (also used by the QA script in Node) ---------- */
  function computeMonth(D, key) {
    var M = D.months[key];
    var staff = D.staff.map(function (s) {
      var h = M.hours[s.id] || [0, 0];
      var gross = s.salary != null ? s.salary : Math.round(s.rate * h[0] + s.rate * 1.5 * h[1]);
      var otPay = s.salary != null ? 0 : Math.round(s.rate * 1.5 * h[1]);
      var burden = Math.round(gross * s.burdenRate);
      var row = { id: s.id, name: s.name, role: s.role, type: s.type, trade: s.trade, tenureYrs: s.tenureYrs,
        rate: s.rate, salary: s.salary, regHours: h[0], otHours: h[1], otPay: otPay, gross: gross, burden: burden, loaded: gross + burden };
      return row;
    });
    var payroll = sum(staff, function (s) { return s.loaded; });
    var fieldStaff = staff.filter(function (s) { return s.type === 'tech' || s.type === 'helper'; });
    var fieldLoaded = sum(fieldStaff, function (s) { return s.loaded; });

    var revenueByService = sum(M.serviceLines, function (x) { return x.revenue; });
    var revenueByChannel = sum(M.channels, function (x) { return x.revenue; });
    var materials = sum(M.serviceLines, function (x) { return x.materials; });
    var vehicles = sum(M.vehicles, function (x) { return x.amount; });
    var ads = sum(M.channels, function (x) { return x.spend; });
    var software = sum(M.software, function (x) { return x.amount; });

    // technicians
    var techIds = Object.keys(M.techs);
    var techs = techIds.map(function (id) {
      var t = M.techs[id];
      var s = staff.filter(function (x) { return x.id === id; })[0];
      var paidHours = s.regHours + s.otHours;
      var gp = t.revenue - t.materials - t.callbackCost;
      return { id: id, name: s.name, trade: s.trade, rate: s.rate, tenureYrs: s.tenureYrs, loaded: s.loaded,
        revenue: t.revenue, materials: t.materials, jobs: t.jobs, avgTicket: Math.round(t.revenue / t.jobs),
        closeRate: t.sold / t.opportunities, callbacks: t.callbacks, callbackRate: t.callbacks / t.jobs, callbackCost: t.callbackCost,
        attachRate: t.agreementsSold / t.eligibleVisits, utilization: t.billableHours / paidHours, otHours: s.otHours,
        grossProfit: gp, gpPerLaborDollar: round2(gp / s.loaded), opportunities: t.opportunities, sold: t.sold };
    });
    var callbackCost = sum(techs, function (t) { return t.callbackCost; });
    var techRevenue = sum(techs, function (t) { return t.revenue; });
    var techMaterials = sum(techs, function (t) { return t.materials; });

    var overheadItems = M.overhead.map(function (o) { return { name: o.name, amount: o.amount }; });
    overheadItems.push({ name: 'Software and subscriptions', amount: software });
    overheadItems.push({ name: 'Warranty and callback cost', amount: callbackCost });
    var overhead = sum(overheadItems, function (o) { return o.amount; });

    var categories = [
      { name: 'Materials and subcontractors', amount: materials },
      { name: 'Payroll and burden', amount: payroll },
      { name: 'Vehicles, fuel and equipment', amount: vehicles },
      { name: 'Advertising', amount: ads }
    ].concat(overheadItems);
    var totalOut = sum(categories, function (c) { return c.amount; });
    var revenue = revenueByService;
    var net = revenue - totalOut;
    var margin = net / revenue;
    var tax = net > 0 ? Math.round(net * D.meta.taxRate) : 0;

    // labor allocation to service lines by hours (largest line takes the rounding remainder so it ties)
    var totalHours = sum(M.serviceLines, function (x) { return x.laborHours; });
    var alloc = M.serviceLines.map(function (x) { return Math.round(fieldLoaded * x.laborHours / totalHours); });
    var diff = fieldLoaded - sum(alloc);
    var maxIdx = 0; M.serviceLines.forEach(function (x, i) { if (x.laborHours > M.serviceLines[maxIdx].laborHours) maxIdx = i; });
    alloc[maxIdx] += diff;
    var serviceLines = M.serviceLines.map(function (x, i) {
      var gp = x.revenue - x.materials - alloc[i];
      return { name: x.name, revenue: x.revenue, materials: x.materials, labor: alloc[i], grossProfit: gp, grossMargin: gp / x.revenue };
    });
    var grossProfit = sum(serviceLines, function (x) { return x.grossProfit; });

    var channels = M.channels.map(function (c) {
      return { name: c.name, revenue: c.revenue, spend: c.spend, paid: c.paid, newCustomers: c.newCustomers,
        perAdDollar: c.spend > 0 ? round2(c.revenue / c.spend) : null,
        costPerNew: c.spend > 0 && c.newCustomers > 0 ? Math.round(c.spend / c.newCustomers) : null };
    });
    var paidRevenue = sum(channels.filter(function (c) { return c.paid; }), function (c) { return c.revenue; });

    var O = M.operations;
    var techOt = techs.map(function (t) { return { name: t.name, ot: t.otHours }; });
    var otTotal = sum(staff, function (s) { return s.otHours; });
    var otPayTotal = sum(staff, function (s) { return s.otPay; });
    var otSorted = staff.slice().sort(function (a, b) { return b.otHours - a.otHours; });
    var otTop2 = otSorted[0].otHours + otSorted[1].otHours;
    var ar = M.receivables.map(function (r) { return { bucket: r.bucket, amount: r.amount }; });
    var arTotal = sum(ar, function (r) { return r.amount; });
    var arOver60 = ar[2].amount + ar[3].amount;
    var jobsTotal = sum(techs, function (t) { return t.jobs; });
    var callbacksTotal = sum(techs, function (t) { return t.callbacks; });
    var oppTotal = sum(techs, function (t) { return t.opportunities; });
    var soldTotal = sum(techs, function (t) { return t.sold; });
    var duplicateCharges = M.software.filter(function (s) { return s.duplicate; });
    var duplicateTotal = sum(duplicateCharges, function (s) { return s.amount; });
    var unmatchedTotal = sum(M.deposits.unmatched, function (u) { return u.amount; });

    var R = M.reviews, G = M.gbp, W = M.website;
    var ops = {
      leads: O.leads, booked: O.booked, bookingRate: O.booked / O.leads, noShows: O.noShows, noShowRate: O.noShows / O.booked,
      closeRate: soldTotal / oppTotal, opportunities: oppTotal, sold: soldTotal, jobs: jobsTotal, callbacks: callbacksTotal,
      callbackRate: callbacksTotal / jobsTotal, truckUtil: O.truckDaysUsed / O.truckDaysAvailable, trucks: O.trucks,
      otTotal: otTotal, otPayTotal: otPayTotal, otTop2: otTop2, otTop2Share: otTotal ? otTop2 / otTotal : 0, otTop2Names: [otSorted[0].name, otSorted[1].name],
      agreementsActive: O.agreementsActive, renewalsDue: O.agreementsRenewalsDue, renewed: O.agreementsRenewed, renewalRate: O.agreementsRenewed / O.agreementsRenewalsDue
    };

    return {
      key: key, label: D.meta.monthLabels[key], staff: staff, payroll: payroll, fieldLoaded: fieldLoaded,
      revenue: revenue, revenueByService: revenueByService, revenueByChannel: revenueByChannel, techRevenue: techRevenue,
      materials: materials, techMaterials: techMaterials, vehicles: vehicles, ads: ads, software: software, overhead: overhead,
      overheadItems: overheadItems, categories: categories, totalOut: totalOut, net: net, margin: margin, tax: tax,
      serviceLines: serviceLines, grossProfit: grossProfit, channels: channels, paidRevenue: paidRevenue, blendedPerAdDollar: round2(paidRevenue / ads),
      techs: techs, callbackCost: callbackCost, ops: ops, ar: ar, arTotal: arTotal, arOver60: arOver60,
      duplicateCharges: duplicateCharges, duplicateTotal: duplicateTotal, deposits: M.deposits, unmatchedTotal: unmatchedTotal,
      revenuePerEmployee: Math.round(revenue / D.staff.length), loadedPerEmployee: Math.round(payroll / D.staff.length),
      reviews: { total: R.total, avg: R.avg, newCount: R.newCount, responseRate: R.responded / R.newCount, medianResponseHrs: R.medianResponseHrs, byService: R.byService },
      gbp: G, website: { mobileScore: W.mobileScore, lcp: W.lcp, lcpPass: W.lcpPass, inp: W.inp, inpPass: W.inpPass, cls: W.cls, clsPass: W.clsPass,
        visits: W.visits, calls: W.calls, formSubmits: W.formSubmits, callRate: W.calls / W.visits, formRate: W.formSubmits / W.visits,
        cwvPass: W.lcpPass && W.inpPass && W.clsPass },
      techOt: techOt
    };
  }

  function computeAll(D) {
    var cur = computeMonth(D, D.meta.currentMonth);
    var prev = computeMonth(D, D.meta.previousMonth);
    var areas = D.rankAreas;

    // local search
    var cells = 0, top3 = 0, top3Prev = 0, mapSum = 0;
    D.ranks.forEach(function (r) { areas.forEach(function (a) { cells++; if (r.map[a][0] <= 3) top3++; if (r.map[a][1] <= 3) top3Prev++; mapSum += r.map[a][0]; }); });
    var clientAvgMapByKw = D.ranks.map(function (r) { return round2(sum(areas.map(function (a) { return r.map[a][0]; })) / areas.length); });
    var clientFairfaxRanks = D.ranks.map(function (r) { return r.map[areas[0]][0]; });

    // AI visibility
    var aiTotal = D.aiLog.length * D.aiEngines.length;
    var aiMentions = sum(D.aiLog, function (row) { return sum(row.r, function (c) { return c[0]; }); });
    var aiPrev = D.months[D.meta.currentMonth].aiMentionsPrev;
    var aiByEngine = D.aiEngines.map(function (e, i) { return { engine: e, mentions: sum(D.aiLog, function (row) { return row.r[i][0]; }), of: D.aiLog.length }; });
    var citedInstead = {};
    D.aiLog.forEach(function (row) { row.r.forEach(function (c) { if (c[2]) citedInstead[c[2]] = (citedInstead[c[2]] || 0) + 1; }); });

    // listings
    var listingIssues = sum(D.listings, function (l) { return (l.name ? 0 : 1) + (l.address ? 0 : 1) + (l.phone ? 0 : 1); });
    var listingsClean = D.listings.filter(function (l) { return l.name && l.address && l.phone; }).length;

    // review gap value (estimate, assumptions shown)
    var g = D.reviewGap;
    var tenths = Math.max(0, Math.round((g.competitorRating - cur.reviews.avg) * 10));
    var extraLeads = g.monthlyProfileLeads * g.upliftPerTenthStar * tenths;
    var extraJobs = extraLeads * g.closeRate;
    var gapRevenue = Math.round(extraJobs * g.avgTicket);
    var gapGP = Math.round(gapRevenue * g.grossMargin);

    // competition table rows (client values filled from the client's own data)
    var comps = D.competitors.map(function (c) {
      var x = JSON.parse(JSON.stringify(c));
      if (x.client) {
        x.reviews = cur.reviews.total; x.rating = cur.reviews.avg; x.velocity = cur.reviews.newCount;
        x.mapRanks = clientFairfaxRanks; x.speed = D.clientSpeed; x.aiRate = aiMentions / aiTotal;
      }
      x.avgMap = round2(sum(x.mapRanks) / x.mapRanks.length);
      return x;
    });
    var client = comps[0], rivals = comps.slice(1);
    var metrics = [
      { k: 'reviews', label: 'Review count', better: 'high' }, { k: 'rating', label: 'Rating', better: 'high' },
      { k: 'velocity', label: 'New reviews / month', better: 'high' }, { k: 'avgMap', label: 'Avg map rank (Fairfax, 10 keywords)', better: 'low' },
      { k: 'speed', label: 'Mobile speed score', better: 'high' }, { k: 'aiRate', label: 'AI mention rate', better: 'high' }
    ];
    var wins = 0;
    var position = metrics.map(function (m) {
      var best = rivals.reduce(function (b, r) { return m.better === 'high' ? Math.max(b, r[m.k]) : Math.min(b, r[m.k]); }, m.better === 'high' ? -Infinity : Infinity);
      var ahead = m.better === 'high' ? client[m.k] >= best : client[m.k] <= best;
      var beaten = rivals.filter(function (r) { return m.better === 'high' ? r[m.k] > client[m.k] : r[m.k] < client[m.k]; }).length;
      if (ahead) wins++;
      return { label: m.label, k: m.k, client: client[m.k], best: best, ahead: ahead, rank: beaten + 1 };
    });
    // keyword wins vs every rival on the same 10 keywords
    var kwWins = D.ranks.filter(function (r, i) { return rivals.every(function (c) { return client.mapRanks[i] < c.mapRanks[i]; }); }).length;
    var rankPoints = sum(position, function (p) { return (comps.length - p.rank) / (comps.length - 1); });

    var checklistOk = D.complianceChecklist.filter(function (c) { return c.ok; }).length;
    var gbpOk = D.gbpChecklist.filter(function (c) { return c.ok; }).length;

    // scorecard (0-100), each formula listed in Data Confidence
    function clamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }
    var fieldTechs = cur.techs;
    var avgUtil = sum(fieldTechs, function (t) { return t.utilization; }) / fieldTechs.length;
    var scores = [
      { name: 'Profitability', score: clamp(cur.margin / 0.12 * 100), basis: 'Net margin vs a 12% target', section: 'financials' },
      { name: 'Marketing efficiency', score: clamp(cur.blendedPerAdDollar / 10 * 100), basis: 'Paid-channel revenue per ad dollar vs 10:1', section: 'financials' },
      { name: 'Team productivity', score: clamp(avgUtil / 0.85 * 100), basis: 'Average tech utilization vs 85%', section: 'financials' },
      { name: 'Online reputation', score: clamp((cur.reviews.avg - 3.5) / 1.5 * 60 + cur.reviews.responseRate * 40), basis: 'Rating (60 pts) + review response rate (40 pts)', section: 'online' },
      { name: 'Local search visibility', score: clamp(top3 / cells * 100), basis: 'Share of keyword and area checks in the map-pack top 3', section: 'online' },
      { name: 'AI visibility', score: clamp(aiMentions / aiTotal * 100), basis: 'Share of AI prompt checks that mention the business', section: 'online' },
      { name: 'Competitive position', score: clamp(rankPoints / metrics.length * 100), basis: 'Average placement vs Competitors A to C across 6 metrics', section: 'competition' },
      { name: 'Compliance readiness', score: clamp(checklistOk / D.complianceChecklist.length * 100), basis: 'Compliance checklist items complete', section: 'market' }
    ];
    scores.forEach(function (s) { s.grade = s.score >= 90 ? 'A' : s.score >= 80 ? 'B' : s.score >= 70 ? 'C' : s.score >= 60 ? 'D' : 'F'; });

    // findings and dollar impacts (monthly)
    var mkt = cur.channels.filter(function (c) { return c.name === 'Marketplace lead service'; })[0];
    var google = cur.channels.filter(function (c) { return c.name === 'Google Ads'; })[0];
    var lsa = cur.channels.filter(function (c) { return c.name === 'Google Local Services'; })[0];
    var gmRate = cur.grossProfit / cur.revenue;
    var mktImpact = Math.round(mkt.spend - mkt.revenue * gmRate);
    var techsByGp = cur.techs.slice().sort(function (a, b) { return b.gpPerLaborDollar - a.gpPerLaborDollar; });
    var highestPaid = cur.techs.slice().sort(function (a, b) { return b.rate - a.rate; })[0];
    var worstCb = cur.techs.slice().sort(function (a, b) { return b.callbackCost - a.callbackCost; })[0];
    var cbImpact = Math.round(worstCb.callbackCost * 0.6);
    var otNames = cur.ops.otTop2Names;
    var otStaff = cur.staff.filter(function (s) { return otNames.indexOf(s.name) >= 0; });
    var otImpact = Math.round(sum(otStaff, function (s) { return s.otPay; }) / 3 * (1 + 0.18));
    var arImpact = cur.arOver60;
    var reviewImpact = gapGP;

    var actions = [
      { title: 'Pause the marketplace lead service and move the budget to Google Local Services', impact: mktImpact, kind: 'profit / month', owner: 'Owner', effort: 'Low (1 hour)', section: '#fin-decisions', sectionName: 'Financials > Decisions',
        why: 'It returned ' + money(mkt.revenue) + ' on ' + money(mkt.spend) + ' of spend (' + mkt.perAdDollar.toFixed(2) + ' per ad dollar) vs ' + google.perAdDollar.toFixed(2) + ' for Google Ads and ' + lsa.perAdDollar.toFixed(2) + ' for Local Services.' },
      { title: 'Collect receivables older than 60 days', impact: arImpact, kind: 'cash (one time)', owner: 'Lena P. (office)', effort: 'Medium (calls + statements)', section: '#fin-ops', sectionName: 'Financials > Operations health',
        why: money(arImpact) + ' of ' + money(cur.arTotal) + ' in receivables is past 60 days.' },
      { title: 'Install quality check: ride-along and checklist for ' + worstCb.name, impact: cbImpact, kind: 'profit / month', owner: 'Owner + ' + highestPaid.name, effort: 'Medium (2 ride-alongs)', section: '#fin-performers', sectionName: 'Financials > Top performers',
        why: worstCb.name + ' had ' + worstCb.callbacks + ' callbacks costing ' + money(worstCb.callbackCost) + ' this month; cutting that by 60% saves the amount shown.' },
      { title: 'Rebalance overtime away from ' + otNames.join(' and '), impact: otImpact, kind: 'profit / month', owner: 'Lena P. (dispatch)', effort: 'Low (schedule change)', section: '#fin-ops', sectionName: 'Financials > Operations health',
        why: otNames.join(' and ') + ' worked ' + cur.ops.otTop2 + ' of ' + cur.ops.otTotal + ' overtime hours. Shifting a third of it to straight time saves the premium plus burden.' },
      { title: 'Close part of the review gap to ' + g.competitor, impact: reviewImpact, kind: 'gross profit / month (est.)', owner: 'Techs + review tool', effort: 'Low (ask at every job)', section: '#online-reviews', sectionName: 'Online > Google reviews',
        why: 'Estimate based on the stated assumptions in the reviews card.' },
      { title: 'Cancel the duplicate ' + cur.duplicateCharges[0].name.toLowerCase() + ' charge', impact: cur.duplicateTotal, kind: 'profit / month', owner: 'Owner', effort: 'Low (1 call)', section: '#fin-money', sectionName: 'Financials > Where the money went',
        why: 'The same subscription is billed twice, in both August and September.' }
    ];
    var ranked = actions.slice().sort(function (a, b) { return b.impact - a.impact; });

    var changes = [
      'Revenue ' + (cur.revenue >= prev.revenue ? 'up ' : 'down ') + money(Math.abs(cur.revenue - prev.revenue)) + ' to ' + money(cur.revenue) + ' (' + pct((cur.revenue - prev.revenue) / prev.revenue, 1) + ').',
      'Net profit before tax ' + (cur.net >= prev.net ? 'up ' : 'down ') + money(Math.abs(cur.net - prev.net)) + ' to ' + money(cur.net) + '; margin ' + pct(prev.margin, 1) + ' to ' + pct(cur.margin, 1) + '.',
      'New Google reviews: ' + cur.reviews.newCount + ' vs ' + prev.reviews.newCount + ' last month; median response time ' + prev.reviews.medianResponseHrs + 'h to ' + cur.reviews.medianResponseHrs + 'h.',
      'Map-pack top 3 placements: ' + top3 + ' of ' + cells + ' keyword checks vs ' + top3Prev + ' last month.',
      'AI mentions: ' + aiMentions + ' of ' + aiTotal + ' prompt checks vs ' + aiPrev + ' last month. Receivables over 60 days ' + money(prev.arOver60) + ' to ' + money(cur.arOver60) + '.'
    ];

    return { cur: cur, prev: prev, scores: scores, actions: ranked, changes: changes,
      local: { cells: cells, top3: top3, top3Prev: top3Prev, avgMap: round2(mapSum / cells), byKw: clientAvgMapByKw },
      ai: { total: aiTotal, mentions: aiMentions, prev: aiPrev, rate: aiMentions / aiTotal, byEngine: aiByEngine, citedInstead: citedInstead },
      listings: { issues: listingIssues, clean: listingsClean, total: D.listings.length },
      gap: { tenths: tenths, extraLeads: extraLeads, extraJobs: extraJobs, revenue: gapRevenue, gp: gapGP },
      comps: comps, position: position, wins: wins, kwWins: kwWins, checklistOk: checklistOk, gbpOk: gbpOk,
      findings: { mkt: mkt, google: google, lsa: lsa, techsByGp: techsByGp, highestPaid: highestPaid, worstCb: worstCb, gmRate: gmRate } };
  }

  function money(n) { var s = Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (n < 0 ? '-$' : '$') + s; }
  function pct(n, d) { return (n * 100).toFixed(d == null ? 0 : d) + '%'; }

  var api = { computeMonth: computeMonth, computeAll: computeAll, money: money, pct: pct };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  /* ---------- rendering (browser only) ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function delta(cur, prev, fmt, goodHigh) {
    var d = cur - prev; if (goodHigh == null) goodHigh = true;
    var cls = d === 0 ? 'flat' : ((d > 0) === goodHigh ? 'up' : 'down');
    var sign = d > 0 ? '▲ ' : d < 0 ? '▼ ' : '';
    return '<span class="delta ' + cls + '">' + sign + fmt(Math.abs(d)) + '</span>';
  }
  function table(head, rows, opts) {
    opts = opts || {};
    return '<div class="tbl-wrap" tabindex="0" role="region" aria-label="' + esc(opts.label || 'Table') + '"><table class="tbl' + (opts.cls ? ' ' + opts.cls : '') + '">' +
      (opts.caption ? '<caption>' + esc(opts.caption) + '</caption>' : '') +
      '<thead><tr>' + head.map(function (h, i) { return '<th scope="col"' + (i ? ' class="num"' : '') + '>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr' + (r.cls ? ' class="' + r.cls + '"' : '') + '>' + (r.cells || r).map(function (c, i) { return i ? '<td class="num">' + c + '</td>' : '<th scope="row">' + c + '</th>'; }).join('') + '</tr>'; }).join('') +
      (opts.foot ? '<tr class="total">' + opts.foot.map(function (c, i) { return i ? '<td class="num">' + c + '</td>' : '<th scope="row">' + c + '</th>'; }).join('') + '</tr>' : '') +
      '</tbody></table></div>';
  }
  // horizontal bar chart with a text alternative
  function bars(items, fmt, label) {
    var max = Math.max.apply(null, items.map(function (i) { return Math.abs(i.v); })) || 1;
    var alt = label + ': ' + items.map(function (i) { return i.l + ' ' + fmt(i.v); }).join('; ') + '.';
    return '<figure class="bars"><div role="img" aria-label="' + esc(alt) + '">' + items.map(function (i) {
      return '<div class="bar-row" aria-hidden="true"><span class="bar-l">' + esc(i.l) + '</span><span class="bar-track"><span class="bar-fill' + (i.bad ? ' bad' : '') + (i.good ? ' good' : '') + '" style="width:' + Math.max(2, Math.abs(i.v) / max * 100).toFixed(1) + '%"></span></span><span class="bar-v">' + fmt(i.v) + '</span></div>';
    }).join('') + '</div><figcaption class="sr-only">' + esc(alt) + '</figcaption></figure>';
  }
  function card(title, body, opts) {
    opts = opts || {};
    return '<article class="card' + (opts.cls ? ' ' + opts.cls : '') + '"' + (opts.id ? ' id="' + opts.id + '"' : '') + '><h3>' + title + '</h3>' + body + '</article>';
  }
  function kpi(label, value, sub) { return '<div class="kpi"><div class="kpi-l">' + label + '</div><div class="kpi-v">' + value + '</div>' + (sub ? '<div class="kpi-s">' + sub + '</div>' : '') + '</div>'; }
  function flag(text, kind) { return '<span class="flag ' + (kind || '') + '">' + esc(text) + '</span>'; }
  function money0(n) { return money(n); }
  function x2(n) { return n == null ? 'n/a' : n.toFixed(2); }

  function render(D) {
    var A = computeAll(D), C = A.cur, P = A.prev, m = money, F = A.findings;
    document.querySelectorAll('[data-month]').forEach(function (el) { el.textContent = C.label; });
    document.querySelectorAll('[data-prev-month]').forEach(function (el) { el.textContent = P.label; });

    /* PART 0 */
    $('ov-headline').innerHTML = kpi('Money in', m(C.revenue), delta(C.revenue, P.revenue, m) + ' vs ' + esc(P.label)) +
      kpi('Money out', m(C.totalOut), delta(C.totalOut, P.totalOut, m, false)) +
      kpi('Left over (before tax)', m(C.net), pct(C.margin, 1) + ' margin ' + delta(C.net, P.net, m)) +
      kpi('Set aside for tax (est.)', m(C.tax), '24% of net profit');
    $('ov-scores').innerHTML = A.scores.map(function (s) {
      return '<a class="score" href="#' + s.section + '"><span class="grade g' + s.grade + '" aria-hidden="true">' + s.grade + '</span><span class="score-t"><b>' + esc(s.name) + '</b><small>' + s.score + ' / 100, grade ' + s.grade + '</small></span></a>';
    }).join('');
    $('ov-actions').innerHTML = A.actions.slice(0, 5).map(function (a, i) {
      return '<li class="action"><div class="action-n">' + (i + 1) + '</div><div><b>' + esc(a.title) + '</b><div class="action-impact">' + m(a.impact) + ' <small>' + esc(a.kind) + '</small></div>' +
        '<p>' + esc(a.why) + '</p><div class="meta">Owner: ' + esc(a.owner) + ' · Effort: ' + esc(a.effort) + ' · Proof: <a href="' + a.section + '">' + esc(a.sectionName) + '</a></div></div></li>';
    }).join('');
    $('ov-changes').innerHTML = A.changes.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('');

    /* PART A: Financials */
    $('fin-bottom').innerHTML = table(['', esc(C.label), esc(P.label), 'Change'], [
      ['Money in (revenue)', m(C.revenue), m(P.revenue), delta(C.revenue, P.revenue, m)],
      ['Money out (all costs)', m(C.totalOut), m(P.totalOut), delta(C.totalOut, P.totalOut, m, false)],
      ['Left over (net profit before tax)', m(C.net), m(P.net), delta(C.net, P.net, m)],
      ['Net margin', pct(C.margin, 1), pct(P.margin, 1), delta(C.margin * 100, P.margin * 100, function (v) { return v.toFixed(1) + ' pts'; })]
    ], { label: 'Bottom line' });

    $('fin-service').innerHTML = bars(C.serviceLines.map(function (s) { return { l: s.name, v: s.revenue }; }), m, 'Revenue by service line, ' + C.label) +
      table(['Service line', 'Revenue', 'Materials + subs', 'Field labor', 'Gross profit', 'Gross margin'],
        C.serviceLines.map(function (s) { return [esc(s.name), m(s.revenue), m(s.materials), m(s.labor), m(s.grossProfit), pct(s.grossMargin, 1)]; }),
        { label: 'Gross margin by service line', foot: ['Total', m(C.revenueByService), m(C.materials), m(C.fieldLoaded), m(C.grossProfit), pct(C.grossProfit / C.revenue, 1)] }) +
      '<p class="note">Field labor = loaded cost of techs and helpers, split by hours logged on each service line.</p>';
    $('fin-channel').innerHTML = bars(C.channels.map(function (c) { return { l: c.name, v: c.revenue }; }), m, 'Revenue by lead channel, ' + C.label) +
      table(['Lead channel', 'Revenue', 'Ad spend', 'New customers'], C.channels.map(function (c) { return [esc(c.name), m(c.revenue), c.spend ? m(c.spend) : '-', c.newCustomers || '-']; }),
        { label: 'Revenue by channel', foot: ['Total', m(C.revenueByChannel), m(C.ads), C.channels.reduce(function (a, c) { return a + c.newCustomers; }, 0)] }) +
      '<p class="tie ' + (C.revenueByChannel === C.revenueByService ? 'ok' : 'bad') + '">Tie-out: by service ' + m(C.revenueByService) + ' = by channel ' + m(C.revenueByChannel) + ' = money in ' + m(C.revenue) + '</p>';

    $('fin-money').innerHTML = bars(C.categories.map(function (c) { return { l: c.name, v: c.amount }; }), m, 'Where the money went, ' + C.label) +
      table(['Expense category', esc(C.label), esc(P.label)], C.categories.map(function (c, i) { return [esc(c.name), m(c.amount), m(P.categories[i].amount)]; }),
        { label: 'Expense categories', foot: ['Total money out', m(C.totalOut), m(P.totalOut)] }) +
      '<h4>Payroll per person</h4>' +
      table(['Person', 'Pay rate', 'Reg hrs', 'OT hrs', 'Gross pay', 'Burden', 'Loaded cost'], C.staff.map(function (s) {
        return [esc(s.name) + '<small>' + esc(s.role) + ', ' + s.tenureYrs + ' yrs</small>', s.salary != null ? m(s.salary) + '/mo' : m(s.rate) + '/hr', s.regHours, s.otHours, m(s.gross), m(s.burden), m(s.loaded)];
      }), { label: 'Payroll per person', foot: ['Payroll + burden', '', C.staff.reduce(function (a, s) { return a + s.regHours; }, 0), C.ops.otTotal, m(C.staff.reduce(function (a, s) { return a + s.gross; }, 0)), m(C.staff.reduce(function (a, s) { return a + s.burden; }, 0)), m(C.payroll)] }) +
      '<h4>Software and subscriptions</h4>' +
      table(['Charge', 'Amount'], C.duplicateCharges.length ? D.months[C.key].software.map(function (s) { return { cells: [esc(s.name) + (s.duplicate ? ' ' + flag('DUPLICATE, also in ' + P.label, 'bad') : ''), m(s.amount)], cls: s.duplicate ? 'hl' : '' }; }) : [],
        { label: 'Software charges', foot: ['Total', m(C.software)] });

    var ch = C.channels.filter(function (c) { return c.paid; });
    $('fin-decisions').innerHTML = '<div class="grid2">' + card('Revenue per ad dollar', bars(ch.map(function (c) { return { l: c.name, v: c.perAdDollar, bad: c.perAdDollar < 1, good: c.perAdDollar >= 8 }; }), function (v) { return v.toFixed(2); }, 'Revenue per ad dollar by channel') +
        '<p class="find">' + flag('Finding', 'bad') + ' Marketplace lead service returns ' + F.mkt.perAdDollar.toFixed(2) + ' per ad dollar (' + m(F.mkt.revenue) + ' on ' + m(F.mkt.spend) + '). Google Ads returns ' + F.google.perAdDollar.toFixed(2) + ' and Local Services ' + F.lsa.perAdDollar.toFixed(2) + '.</p>') +
      card('Cost per new customer', table(['Channel', 'Ad spend', 'New customers', 'Cost each'], ch.map(function (c) { return { cells: [esc(c.name), m(c.spend), c.newCustomers, c.costPerNew != null ? m(c.costPerNew) : 'n/a'], cls: c.name === F.mkt.name ? 'hl' : '' }; }), { label: 'Cost per new customer' }) +
        '<p class="note">Referrals, repeat and organic customers carry no ad spend.</p>') +
      card('Revenue per employee vs cost', '<div class="kpis">' + kpi('Revenue per employee', m(C.revenuePerEmployee), 'Money in ÷ ' + D.staff.length + ' people') + kpi('Loaded cost per employee', m(C.loadedPerEmployee), 'Payroll + burden ÷ ' + D.staff.length) + kpi('Ratio', (C.revenuePerEmployee / C.loadedPerEmployee).toFixed(2) + 'x', 'Each payroll dollar brings in this much') + '</div>') + '</div>';

    var T = A.findings.techsByGp;
    var top2 = T.slice(0, 2), bottom = T[T.length - 1];
    $('fin-performers').innerHTML = table(['Tech', 'GP per loaded labor $', 'Revenue', 'Avg ticket', 'Close rate', 'Callback rate', 'Agreement attach', 'Utilization', 'Pay rate'],
      T.map(function (t, i) {
        var tag = i < 2 ? ' ' + flag('Top ' + (i + 1), 'good') : (i === T.length - 1 ? ' ' + flag('Bottom', 'bad') : '');
        return { cells: [esc(t.name) + tag + '<small>' + esc(t.trade) + ', ' + t.tenureYrs + ' yrs</small>', t.gpPerLaborDollar.toFixed(2), m(t.revenue), m(t.avgTicket), pct(t.closeRate), pct(t.callbackRate, 1), pct(t.attachRate), pct(t.utilization), m(t.rate) + '/hr'], cls: i === T.length - 1 ? 'hl' : '' };
      }), { label: 'Technician leaderboard' }) +
      '<p class="note">Gross profit per loaded labor dollar = (tech revenue − materials on their jobs − their callback cost) ÷ their loaded payroll cost.</p>' +
      '<div class="grid2">' + card('Highest-paid vs most profitable', '<p><b>' + esc(F.highestPaid.name) + '</b> is the highest-paid tech at ' + m(F.highestPaid.rate) + '/hr but returns ' + F.highestPaid.gpPerLaborDollar.toFixed(2) + ' per loaded labor dollar, rank ' + (T.indexOf(F.highestPaid) + 1) + ' of ' + T.length + '.</p><p><b>' + esc(top2[0].name) + '</b> earns ' + m(top2[0].rate) + '/hr and returns ' + top2[0].gpPerLaborDollar.toFixed(2) + ', the best on the team, with a ' + pct(top2[0].closeRate) + ' close rate and ' + pct(top2[0].attachRate) + ' agreement attach rate.</p>') +
      card('Callbacks cost real money', '<p><b>' + esc(F.worstCb.name) + '</b>: ' + F.worstCb.callbacks + ' install callbacks on ' + F.worstCb.jobs + ' jobs (' + pct(F.worstCb.callbackRate, 1) + ') cost ' + m(F.worstCb.callbackCost) + ' in unbilled labor and parts this month, ' + pct(F.worstCb.callbackCost / C.callbackCost) + ' of all callback cost (' + m(C.callbackCost) + ').</p>') + '</div>';

    var O = C.ops, PO = P.ops;
    $('fin-ops').innerHTML = table(['Measure', esc(C.label), esc(P.label)], [
      ['Booking rate (booked ÷ leads)', pct(O.bookingRate) + ' <small>' + O.booked + ' of ' + O.leads + '</small>', pct(PO.bookingRate)],
      ['Close rate (sold ÷ quoted)', pct(O.closeRate) + ' <small>' + O.sold + ' of ' + O.opportunities + '</small>', pct(PO.closeRate)],
      ['No-shows', O.noShows + ' <small>' + pct(O.noShowRate, 1) + '</small>', PO.noShows],
      ['Callbacks', O.callbacks + ' <small>' + pct(O.callbackRate, 1) + ' of jobs</small>', PO.callbacks],
      ['Truck utilization', pct(O.truckUtil) + ' <small>' + O.trucks + ' trucks</small>', pct(PO.truckUtil)],
      ['Overtime hours', O.otTotal + ' <small>' + m(O.otPayTotal) + ' OT pay</small>', PO.otTotal],
      ['Maintenance agreements active', O.agreementsActive, PO.agreementsActive],
      ['Agreement renewals', O.renewed + ' of ' + O.renewalsDue + ' <small>' + pct(O.renewalRate) + '</small>', PO.renewed + ' of ' + PO.renewalsDue]
    ], { label: 'Operations health' }) +
      '<p class="find">' + flag('Finding', 'bad') + ' ' + esc(O.otTop2Names.join(' and ')) + ' worked ' + O.otTop2 + ' of ' + O.otTotal + ' overtime hours (' + pct(O.otTop2Share) + ').</p>' +
      '<h4>Receivables aging</h4>' + bars(C.ar.map(function (r, i) { return { l: r.bucket, v: r.amount, bad: i >= 2 }; }), m, 'Receivables aging') +
      '<p class="find">' + flag('Finding', 'bad') + ' ' + m(C.arOver60) + ' (' + pct(C.arOver60 / C.arTotal) + ' of ' + m(C.arTotal) + ') is more than 60 days old, up from ' + m(P.arOver60) + '.</p>' +
      '<h4>Deposits vs jobs</h4><p>' + C.deposits.matchedCount + ' deposits (' + m(C.deposits.matchedTotal) + ') matched to invoices. ' +
      C.deposits.unmatched.map(function (u) { return flag('UNRECONCILED', 'bad') + ' ' + esc(u.date) + ': ' + m(u.amount) + ', ' + esc(u.memo) + '.'; }).join(' ') + '</p>';

    $('fin-tax').innerHTML = '<div class="tax"><div class="tax-row"><span>Net profit before tax</span><b>' + m(C.net) + '</b></div><div class="tax-row"><span>× estimate rate</span><b>' + pct(D.meta.taxRate) + '</b></div><div class="tax-row total"><span>Set aside this month</span><b>' + m(C.tax) + '</b></div></div>' +
      '<p class="tax-math">' + m(C.net) + ' × ' + D.meta.taxRate + ' = ' + m(C.tax) + ' (' + esc(P.label) + ': ' + m(P.net) + ' × ' + D.meta.taxRate + ' = ' + m(P.tax) + ')</p>' +
      '<p class="callout">This is an estimate to help you set money aside. It does not replace your accountant.</p>';

    var leaks = A.actions.filter(function (a) { return a.kind.indexOf('profit') === 0; });
    $('fin-leak').innerHTML = '<div class="leak"><div class="leak-l">Biggest leak</div><b>' + esc(leaks[0].title) + '</b><div class="action-impact">' + m(leaks[0].impact) + ' <small>' + esc(leaks[0].kind) + '</small></div><p>' + esc(leaks[0].why) + '</p></div>' +
      '<h4>Runner-ups</h4><ol class="runner">' + leaks.slice(1, 3).map(function (l) { return '<li><b>' + esc(l.title) + '</b>: ' + m(l.impact) + ' ' + esc(l.kind) + '</li>'; }).join('') + '</ol>';

    /* PART B: Online */
    var R = C.reviews, PR = P.reviews, g = D.reviewGap;
    $('online-reviews').innerHTML = '<div class="kpis">' + kpi('Total reviews', R.total, delta(R.total, PR.total, String)) + kpi('Average rating', R.avg.toFixed(1) + ' ★', 'vs ' + PR.avg.toFixed(1)) +
      kpi('New this month', R.newCount, 'vs ' + PR.newCount + ' last month') + kpi('Response rate', pct(R.responseRate), 'median ' + R.medianResponseHrs + 'h (was ' + PR.medianResponseHrs + 'h)') + '</div>' +
      '<h4>Review velocity (new reviews per month)</h4>' + bars(D.reviewHistory.map(function (r) { return { l: r.m, v: r.n }; }), String, 'New reviews per month, April to September 2026') +
      '<div class="grid2">' + card('Rating by service line (new reviews)', table(['Service', 'Rating', 'Reviews'], R.byService.map(function (b) { return [esc(b.line), b.rating.toFixed(1), b.count]; }), { label: 'Rating by service' })) +
      card('Themes (paraphrased, invented)', '<h4>Praise</h4><ul class="list">' + D.reviewThemes.praise.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul><h4>Complaints</h4><ul class="list">' + D.reviewThemes.complaints.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul><p class="note">' + esc(D.reviewThemes.note) + '</p>') + '</div>' +
      card('Value of closing the gap to ' + esc(g.competitor) + ' (estimate)', '<p>' + esc(g.competitor) + ' averages ' + g.competitorRating.toFixed(1) + '★ on ' + g.competitorReviews + ' reviews. Closing ' + A.gap.tenths + ' tenths of a star is worth about <b>' + m(A.gap.revenue) + ' revenue / ' + m(A.gap.gp) + ' gross profit a month</b>.</p>' +
        '<p class="note">Assumptions: ' + g.monthlyProfileLeads + ' profile leads a month × ' + pct(g.upliftPerTenthStar) + ' more leads per 0.1★ × ' + A.gap.tenths + ' = ' + A.gap.extraLeads.toFixed(1) + ' leads; × ' + pct(g.closeRate) + ' close = ' + A.gap.extraJobs.toFixed(1) + ' jobs; × ' + m(g.avgTicket) + ' avg ticket; × ' + pct(g.grossMargin) + ' gross margin.</p>');

    var G = C.gbp, PG = P.gbp;
    $('online-gbp').innerHTML = table(['Profile activity', esc(C.label), esc(P.label), 'Change'], [['Calls', 'calls'], ['Direction requests', 'directions'], ['Website clicks', 'websiteClicks'], ['Messages', 'messages'], ['Profile views', 'views']].map(function (r) {
      return [r[0], G[r[1]].toLocaleString('en-US'), PG[r[1]].toLocaleString('en-US'), delta(G[r[1]], PG[r[1]], function (v) { return v.toLocaleString('en-US'); })];
    }), { label: 'Google Business Profile activity' }) +
      '<div class="grid2">' + card('Completeness: ' + A.gbpOk + ' of ' + D.gbpChecklist.length, '<ul class="check">' + D.gbpChecklist.map(function (c) { return '<li class="' + (c.ok ? 'ok' : 'no') + '"><span class="sr-only">' + (c.ok ? 'Done: ' : 'Missing: ') + '</span>' + esc(c.item) + '</li>'; }).join('') + '</ul>') +
      card('Photos, posts and Q&amp;A', '<ul class="list"><li>' + G.photos + ' photos; newest is ' + G.newestPhotoDays + ' days old ' + (G.newestPhotoDays > 30 ? flag('stale', 'bad') : '') + '</li><li>' + G.posts + ' post this month (was ' + PG.posts + ')</li><li>Q&amp;A: ' + G.qaAnswered + ' answered, ' + G.qaUnanswered + ' unanswered ' + (G.qaUnanswered ? flag('answer these', 'bad') : '') + '</li></ul>') + '</div>';

    var areas = D.rankAreas;
    function rk(v) { return v > 20 ? '20+' : v; }
    $('online-local').innerHTML = '<div class="tbl-wrap" tabindex="0" role="region" aria-label="Local rank grid"><table class="tbl grid-rank"><caption>Map-pack rank (organic rank below), change since last month</caption><thead><tr><th scope="col">Keyword</th>' +
      areas.map(function (a) { return '<th scope="col" class="num">' + esc(a) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      D.ranks.map(function (r) {
        return '<tr><th scope="row">' + esc(r.kw) + '</th>' + areas.map(function (a) {
          var mp = r.map[a], og = r.org[a], d = mp[1] - mp[0];
          return '<td class="num rank r' + (mp[0] <= 3 ? 'top' : mp[0] <= 6 ? 'mid' : 'low') + '"><b>' + rk(mp[0]) + '</b>' + (d ? '<span class="delta ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '▲' : '▼') + Math.abs(d) + '</span>' : '') + '<small>org ' + rk(og[0]) + '</small></td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<p>Map-pack top 3 in <b>' + A.local.top3 + ' of ' + A.local.cells + '</b> checks (was ' + A.local.top3Prev + '). Average map rank ' + A.local.avgMap.toFixed(1) + '.</p><p class="note">' + esc(D.rankMethod) + '</p>';

    var W = C.website, PW = P.website;
    $('online-web').innerHTML = '<div class="kpis">' + kpi('Mobile speed score', W.mobileScore + ' / 100', 'was ' + PW.mobileScore) + kpi('Core Web Vitals', W.cwvPass ? 'Pass' : 'Fail', 'LCP ' + esc(W.lcp) + (W.lcpPass ? ' ✓' : ' ✕') + ' · INP ' + esc(W.inp) + (W.inpPass ? ' ✓' : ' ✕') + ' · CLS ' + esc(W.cls) + (W.clsPass ? ' ✓' : ' ✕')) +
      kpi('Click-to-call rate', pct(W.callRate, 1), W.calls + ' calls from ' + W.visits.toLocaleString('en-US') + ' visits') + kpi('Form conversion', pct(W.formRate, 1), W.formSubmits + ' forms (was ' + pct(PW.formRate, 1) + ')') + '</div>' +
      '<div class="grid2">' + card('Top landing pages by leads', bars(D.websitePages.map(function (p) { return { l: p.path, v: p.leads }; }), String, 'Leads by landing page')) +
      card('Broken or missing pages', '<ul class="list">' + D.websiteIssues.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul><h4>Local pages per service area</h4><ul class="list">' + D.localPages.map(function (l) { return '<li>' + esc(l.area) + ': ' + l.pages + (l.pages === 0 ? ' ' + flag('missing', 'bad') : '') + '</li>'; }).join('') + '</ul>') + '</div>';

    function yn(v) { return v ? '<span class="ok">✓<span class="sr-only"> matches</span></span>' : '<span class="no">✕<span class="sr-only"> mismatch</span></span>'; }
    $('online-listings').innerHTML = '<p><b>' + A.listings.issues + ' inconsistencies</b> across ' + A.listings.total + ' directories; ' + A.listings.clean + ' fully consistent.</p>' +
      table(['Directory', 'Name', 'Address', 'Phone'], D.listings.map(function (l) { return [esc(l.dir), yn(l.name), yn(l.address), yn(l.phone)]; }), { label: 'Listings consistency' }) +
      '<h4>Top fixes</h4><ol class="runner">' + D.listingFixes.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ol>';

    $('online-ai').innerHTML = '<div class="kpis">' + kpi('AI visibility score', Math.round(A.ai.rate * 100) + ' / 100', A.ai.mentions + ' of ' + A.ai.total + ' checks mention the business (was ' + A.ai.prev + ')') +
      A.ai.byEngine.map(function (e) { return kpi(esc(e.engine), e.mentions + ' / ' + e.of, 'prompts mentioning you'); }).join('') + '</div>' +
      '<div class="tbl-wrap" tabindex="0" role="region" aria-label="AI prompt log"><table class="tbl ai-log"><caption>Prompt log: ✓ position, or ✕ and who was cited instead (source the answer appeared to rely on)</caption><thead><tr><th scope="col">Prompt</th>' +
      D.aiEngines.map(function (e) { return '<th scope="col">' + esc(e) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      D.aiLog.map(function (row) {
        return '<tr><th scope="row">' + esc(row.p) + '</th>' + row.r.map(function (c) {
          return c[0] ? '<td class="ai-yes"><b>✓ #' + c[1] + '</b><small>' + esc(c[3]) + '</small></td>' : '<td class="ai-no"><b>✕ ' + esc(c[2]) + '</b><small>' + esc(c[3]) + '</small></td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<h4>Three fixes most likely to move it</h4><ol class="runner">' + D.aiFixes.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ol><p class="note">' + esc(D.aiNote) + '</p>';

    /* PART C: Competition */
    var comps = A.comps;
    function cv(c, k) {
      var v = c[k];
      if (k === 'rating') return v.toFixed(1);
      if (k === 'aiRate') return pct(v);
      if (k === 'avgMap') return v.toFixed(1);
      return v;
    }
    var rowsDef = [['Reviews', 'reviews'], ['Rating', 'rating'], ['New reviews / month', 'velocity'], ['Avg map rank (10 keywords, Fairfax)', 'avgMap'], ['Mobile speed score', 'speed'], ['AI mention rate', 'aiRate'],
      ['Services', 'services'], ['Service areas', 'areas'], ['Brand', 'brand'], ['Financing', 'financing'], ['Ad presence (public ad libraries)', 'ads'], ['Hiring signals', 'hiring'], ['Promotions', 'promo']];
    $('comp-table').innerHTML = '<div class="tbl-wrap" tabindex="0" role="region" aria-label="Competitor comparison"><table class="tbl comp"><thead><tr><th scope="col">Metric</th>' + comps.map(function (c) { return '<th scope="col"' + (c.client ? ' class="client"' : '') + '>' + esc(c.client ? 'You (sample)' : c.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rowsDef.map(function (r) { return '<tr><th scope="row">' + r[0] + '</th>' + comps.map(function (c) { return '<td' + (c.client ? ' class="client"' : '') + '>' + esc(cv(c, r[1])) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' +
      '<h4>Map-pack rank on the same 10 keywords (Fairfax)</h4>' +
      '<div class="tbl-wrap" tabindex="0" role="region" aria-label="Keyword ranks by competitor"><table class="tbl"><thead><tr><th scope="col">Keyword</th>' + comps.map(function (c) { return '<th scope="col" class="num">' + esc(c.client ? 'You' : c.name.replace('Competitor ', 'Comp. ')) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      D.ranks.map(function (r, i) { var best = Math.min.apply(null, comps.map(function (c) { return c.mapRanks[i]; })); return '<tr><th scope="row">' + esc(r.kw) + '</th>' + comps.map(function (c) { return '<td class="num' + (c.mapRanks[i] === best ? ' best' : '') + '">' + c.mapRanks[i] + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' +
      '<p>You hold the best Fairfax map rank outright on <b>' + A.kwWins + ' of ' + D.ranks.length + '</b> keywords.</p>';
    var ahead = A.position.filter(function (p) { return p.ahead; }), behind = A.position.filter(function (p) { return !p.ahead; });
    function pv(p) { return p.k === 'rating' ? p.client.toFixed(1) + ' vs best ' + p.best.toFixed(1) : p.k === 'aiRate' ? pct(p.client) + ' vs best ' + pct(p.best) : p.k === 'avgMap' ? p.client.toFixed(1) + ' vs best ' + p.best.toFixed(1) : p.client + ' vs best ' + p.best; }
    $('comp-gaps').innerHTML = '<div class="grid2">' + card('Where you are ahead', ahead.length ? '<ul class="list yes">' + ahead.map(function (p) { return '<li>' + esc(p.label) + ': ' + esc(pv(p)) + '</li>'; }).join('') + '</ul>' : '<p>Not ahead on any of the six measured metrics yet. Strengths: full HVAC plus electrical range and maintenance plans across 3 areas.</p>') +
      card('Where you are behind', '<ul class="list no">' + behind.map(function (p) { return '<li>' + esc(p.label) + ': ' + esc(pv(p)) + ' (rank ' + p.rank + ' of ' + comps.length + ')</li>'; }).join('') + '</ul>') + '</div>' +
      card('Cheapest three moves to close the gap', '<ol class="runner"><li>Ask for a review at every completed job and reply within 24 hours (no cost; targets review count, velocity and rating).</li><li>Compress home-page images and fix the broken financing link (about a day of web work; mobile speed ' + D.clientSpeed + ' vs ' + Math.max.apply(null, comps.slice(1).map(function (c) { return c.speed; })) + ').</li><li>Fix the ' + A.listings.issues + ' listing mismatches and add Burke and Springfield pages (helps map rank and AI mentions).</li></ol>');
    $('comp-moves').innerHTML = D.marketMoves.map(function (mv, i) { return '<div class="move"><div class="move-n">' + (i + 1) + '</div><div><p><b>Move:</b> ' + esc(mv.move) + '</p><p><b>Response:</b> ' + esc(mv.response) + '</p></div></div>'; }).join('');

    /* PART D: Local market (real, sourced) */
    var today = new Date(); today.setHours(0, 0, 0, 0);
    function daysUntil(iso) { var p = iso.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]); return Math.round((d - today) / 86400000); }
    function fmtDate(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    function countdown(iso) { var n = daysUntil(iso); return n > 0 ? '<span class="cd">' + n + ' day' + (n === 1 ? '' : 's') + ' left</span>' : n === 0 ? '<span class="cd">today</span>' : '<span class="cd past">' + (-n) + ' days ago</span>'; }
    var catOrder = ['Regulations and licensing', 'Refrigerant and equipment rules', 'Compliance calendar', 'Supply and pricing', 'Labor market', 'Demand drivers', 'Local news'];
    function itemCard(e) {
      return '<article class="dcard"><div class="dcard-top"><span class="imp ' + e.impact + '">' + e.impact.toUpperCase() + ' impact</span>' + (e.illustrative ? flag('ILLUSTRATIVE EXAMPLE', 'bad') : '') + '</div>' +
        '<h4>' + esc(e.headline) + '</h4><p><b>What it means:</b> ' + esc(e.meaning) + '</p><p class="why"><b>Why ' + e.impact + ':</b> ' + esc(e.impactWhy) + '</p>' +
        (e.date ? '<p class="ddate"><b>' + esc(e.dateLabel) + ':</b> ' + fmtDate(e.date) + ' ' + countdown(e.date) + '</p>' : '') +
        '<p class="src">Source: <a href="' + esc(e.url) + '" target="_blank" rel="noopener">' + esc(e.publisher) + '</a>' + (e.published ? ' (dated ' + fmtDate(e.published) + ')' : '') + ' · As of ' + fmtDate(e.asOf) + '</p></article>';
    }
    function tabBody(tab) {
      var items = D.external.filter(function (e) { return e.tab === tab; });
      var html = catOrder.map(function (c) {
        var its = items.filter(function (e) { return e.cat === c; });
        return its.length ? '<h3 class="dcat">' + esc(c) + '</h3><div class="dgrid">' + its.map(itemCard).join('') + '</div>' : '';
      }).join('');
      if (tab === 'virginia') {
        var cal = D.compliance.slice().concat(D.external.filter(function (e) { return e.date && daysUntil(e.date) >= 0; }).map(function (e) { return { item: e.headline, verifiedDate: e.date, src: e.publisher, url: e.url }; }));
        cal.sort(function (a, b) { var da = a.verifiedDate || a.sampleDate || '9999', db = b.verifiedDate || b.sampleDate || '9999'; return da < db ? -1 : 1; });
        html = '<h3 class="dcat">Compliance calendar</h3><p class="note">Dates marked <b>SAMPLE DATE</b> belong to the fictional business; the rule behind each one is real and linked. Countdowns update daily from today\'s date.</p><ul class="cal">' +
          cal.map(function (c) {
            var date = c.verifiedDate || c.sampleDate;
            return '<li><div class="cal-d">' + (date ? fmtDate(date) + countdown(date) : 'No expiration') + '</div><div><b>' + esc(c.item) + '</b> ' +
              (c.verifiedDate ? flag('VERIFIED DATE', 'good') : c.sampleDate ? flag('SAMPLE DATE (fictional)', '') : '') +
              (c.rule ? '<small>' + esc(c.rule) + '</small>' : '') +
              (c.url ? '<small>Source: <a href="' + esc(c.url) + '" target="_blank" rel="noopener">' + esc(c.src) + '</a> · As of ' + fmtDate(D.meta.reportBuilt) + '</small>' : '') + '</div></li>';
          }).join('') + '</ul>' + html;
      }
      var sw = D.soWhat[tab];
      html += '<div class="sowhat"><h3>So what this month</h3><ol>' + sw.map(function (s) { return '<li><b>' + esc(s.item) + ':</b> ' + esc(s.action) + '</li>'; }).join('') + '</ol></div>';
      return html;
    }
    $('panel-fairfax').innerHTML = tabBody('fairfax');
    $('panel-virginia').innerHTML = tabBody('virginia');

    /* DATA CONFIDENCE */
    var tie = [
      ['Revenue by service line = revenue by channel = money in', C.revenueByService === C.revenueByChannel && C.revenueByChannel === C.revenue && P.revenueByService === P.revenueByChannel],
      ['Tech-attributed revenue and materials = company totals', C.techRevenue === C.revenue && C.techMaterials === C.materials && P.techRevenue === P.revenue && P.techMaterials === P.materials],
      ['Expense categories sum to money out', C.categories.reduce(function (a, c) { return a + c.amount; }, 0) === C.totalOut],
      ['Per-person loaded payroll sums to the payroll line', C.staff.reduce(function (a, s) { return a + s.loaded; }, 0) === C.payroll],
      ['Callback cost line = sum of tech callback costs', C.overheadItems.filter(function (o) { return o.name === 'Warranty and callback cost'; })[0].amount === C.callbackCost],
      ['Tax estimate = 24% of positive net profit', C.tax === Math.round(Math.max(0, C.net) * D.meta.taxRate)]
    ];
    $('dc-tied').innerHTML = '<ul class="check">' + tie.map(function (t) { return '<li class="' + (t[1] ? 'ok' : 'no') + '"><span class="sr-only">' + (t[1] ? 'Passes: ' : 'Fails: ') + '</span>' + esc(t[0]) + '</li>'; }).join('') + '</ul>' +
      '<p class="note">In a real report these tie to the payroll export, bank statement, jobs CSV and ad exports you provide. Here they tie to the sample data.</p>';
    $('dc-unmatched').textContent = C.deposits.unmatched.length ? C.deposits.unmatched.length + ' ' + C.label + ' deposit(s) totaling ' + m(C.unmatchedTotal) + ' have no matching invoice and are flagged unreconciled.' : 'All deposits matched to invoices.';
    $('dc-scores').innerHTML = '<ul class="list">' + A.scores.map(function (s) { return '<li><b>' + esc(s.name) + ' (' + s.score + '):</b> ' + esc(s.basis) + '</li>'; }).join('') + '</ul>';
    $('dc-sources').innerHTML = table(['Item', 'Publisher', 'Source', 'As of'], D.external.map(function (e) { return [esc(e.headline), esc(e.publisher), '<a href="' + esc(e.url) + '" target="_blank" rel="noopener">Link</a>', fmtDate(e.asOf)]; }), { label: 'Part D sources', cls: 'src-tbl' });

    document.body.classList.add('ready');
  }

  function initTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
    function select(t, focus) {
      tabs.forEach(function (x) { var on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; document.getElementById(x.getAttribute('aria-controls')).hidden = !on; });
      if (focus) t.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t); });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); select(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length], true); }
      });
    });
  }
  function initNav() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.secnav a'));
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) links.forEach(function (l) { var on = l.getAttribute('href') === '#' + en.target.id; l.classList.toggle('on', on); if (on) { l.setAttribute('aria-current', 'true'); if (l.scrollIntoView && l.parentNode.scrollWidth > l.parentNode.clientWidth) l.parentNode.scrollLeft = l.offsetLeft - 16; } else l.removeAttribute('aria-current'); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach(function (l) { var s = document.querySelector(l.getAttribute('href')); if (s) io.observe(s); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    try {
      var D = JSON.parse(document.getElementById('snapshot-data').textContent);
      render(D); initTabs(); initNav();
    } catch (e) {
      var el = document.getElementById('load-error'); if (el) el.hidden = false;
      if (window.console) console.error(e);
    }
  });
})(this);
