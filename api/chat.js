// api/chat.js
// Universal Claude chat endpoint for all CNCVault and MedVault staff vaults.
// API key lives in Vercel environment variables — never exposed to the browser.

module.exports = async function handler(req, res) {

  // CORS — allow requests from your own domain only
  const origin = req.headers.origin || '';
  const allowed = [
    'https://skillededge.io',
    'https://www.skillededge.io',
    'https://skillededge-site.vercel.app'
  ];

  if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Allow direct requests (same-origin)
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate request body
  const { messages, systemPrompt } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  if (!systemPrompt || typeof systemPrompt !== 'string') {
    return res.status(400).json({ error: 'systemPrompt string required' });
  }

  // Trim to last 10 messages to keep costs down
  const trimmedMessages = messages.slice(-10);

  // API key from Vercel environment variable — never hardcoded
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY environment variable not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: systemPrompt,
        messages: trimmedMessages
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
      return res.status(502).json({ error: 'Upstream API error' });
    }

    const data = await response.json();

    return res.status(200).json({
      content: data.content,
      usage: data.usage
    });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

