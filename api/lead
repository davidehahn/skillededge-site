// /api/lead.js
// Receives calculator submissions from the Electrical and CNC/Fab profit-leak
// calculators and pushes them into Beehiiv — tagged by niche so the two
// outreach tests can be segmented and measured separately.
//
// Reuses the SAME env vars already configured for /api/subscribe.js:
//   BEEHIIV_API_KEY          — Beehiiv → Settings → Workspace Settings → API
//   BEEHIIV_PUBLICATION_ID   — pub_b9ffbd01-aab6-41d9-98e7-b8a72be5370f
//
// Optional (only if you also want rows on the Ops Brain dashboard sheet):
//   OPS_BRAIN_WEBHOOK_URL    — Apps Script /exec URL. If unset, this step is skipped.

const NICHES = {
  'electrical': {
    utm_source: 'electrical_calculator',
    utm_campaign: 'electrical_profit_audit_lead_magnet'
  },
  'cnc-manufacturing': {
    utm_source: 'cnc_calculator',
    utm_campaign: 'cnc_profit_audit_lead_magnet'
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const { email, niche } = body;

  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email is required.' });
  }
  if (!niche || !NICHES[niche]) {
    return res.status(400).json({ error: 'A valid niche is required.' });
  }

  const apiKey = process.env.BEEHIIV_API_KEY;
  const pubId = process.env.BEEHIIV_PUBLICATION_ID;
  if (!apiKey || !pubId) {
    console.error('Missing BEEHIIV_API_KEY or BEEHIIV_PUBLICATION_ID env vars');
    console.warn('UNSAVED LEAD:', JSON.stringify(body));
    return res.status(500).json({ error: 'Server not configured.' });
  }

  const { utm_source, utm_campaign } = NICHES[niche];

  // Calculator context stored as Beehiiv custom fields, so the demo call can be
  // prepped straight from the subscriber record.
  const customFields = [
    { name: 'Niche', value: String(niche) },
    { name: 'Annual Revenue', value: String(body.annual_revenue ?? '') },
    { name: 'Crew or Operator Count', value: String(body.crew_count ?? body.operator_count ?? '') },
    { name: 'Loaded Rate', value: String(body.loaded_rate ?? '') },
    { name: 'Modeled Total', value: String(body.modeled_total ?? '') },
    { name: 'Conservative Total', value: String(body.conservative_total ?? '') }
  ].filter(f => f.value !== '' && f.value !== 'null' && f.value !== 'undefined');

  try {
    const beehiivRes = await fetch(
      `https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          email: email,
          reactivate_existing: false,
          send_welcome_email: false,
          utm_source: utm_source,
          utm_medium: 'web',
          utm_campaign: utm_campaign,
          custom_fields: customFields,
        }),
      }
    );

    const data = await beehiivRes.json();
    if (!beehiivRes.ok) {
      console.error('Beehiiv error:', data);
      console.warn('UNSAVED LEAD:', JSON.stringify(body));
      return res.status(beehiivRes.status).json({
        error: data?.errors?.[0]?.message || 'Subscription failed.'
      });
    }

    // Optional secondary write to the Ops Brain dashboard. Never blocks the
    // response — if it fails, the lead is already safe in Beehiiv.
    const webhookUrl = process.env.OPS_BRAIN_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'calculator_lead',
            email,
            niche,
            submitted_at: body.submitted_at || new Date().toISOString(),
            annual_revenue: body.annual_revenue ?? null,
            crew_count: body.crew_count ?? body.operator_count ?? null,
            loaded_rate: body.loaded_rate ?? null,
            modeled_total: body.modeled_total ?? null,
            conservative_total: body.conservative_total ?? null,
            category_breakdown: body.category_breakdown || {},
            page: body.page || null
          }),
          redirect: 'follow'
        });
      } catch (whErr) {
        console.error('Ops Brain webhook failed (lead still saved in Beehiiv):', whErr);
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Lead handler error:', err);
    console.warn('UNSAVED LEAD:', JSON.stringify(body));
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
