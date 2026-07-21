// /api/subscribe.js
// Receives { email } from the 3PL calculator gate and pushes it into Beehiiv,
// tagged so it can be segmented into its own automation later.
//
// Required Vercel env vars (Project Settings → Environment Variables):
//   BEEHIIV_API_KEY          — from Beehiiv → Settings → Workspace Settings → API
//   BEEHIIV_PUBLICATION_ID   — pub_b9ffbd01-aab6-41d9-98e7-b8a72be5370f

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};

  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email is required.' });
  }

  const apiKey = process.env.BEEHIIV_API_KEY;
  const pubId = process.env.BEEHIIV_PUBLICATION_ID;

  if (!apiKey || !pubId) {
    console.error('Missing BEEHIIV_API_KEY or BEEHIIV_PUBLICATION_ID env vars');
    return res.status(500).json({ error: 'Server not configured.' });
  }

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
          utm_source: '3pl_calculator',
          utm_medium: 'web',
          utm_campaign: '3pl_margin_audit_lead_magnet',
        }),
      }
    );

    const data = await beehiivRes.json();

    if (!beehiivRes.ok) {
      console.error('Beehiiv error:', data);
      return res.status(beehiivRes.status).json({ error: data?.errors?.[0]?.message || 'Subscription failed.' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Subscribe handler error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}