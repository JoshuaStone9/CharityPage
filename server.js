const crypto = require('crypto');
const express = require('express');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const {
  TRUELAYER_CLIENT_ID,
  TRUELAYER_CLIENT_SECRET,
  TRUELAYER_AUTH_BASE,
  TRUELAYER_API_BASE,
  TRUELAYER_HPP_BASE,
  TRUELAYER_MERCHANT_ACCOUNT_ID,
  TRUELAYER_REDIRECT_URI,
  TRUELAYER_CURRENCY,
  DEFAULT_DONATION_MINOR,
  PORT
} = process.env;

function requireEnv(name) {
  if (!process.env[name]) {
    throw new Error(`Missing required env var: ${name}`);
  }
}

async function getAccessToken() {
  requireEnv('TRUELAYER_CLIENT_ID');
  requireEnv('TRUELAYER_CLIENT_SECRET');
  requireEnv('TRUELAYER_AUTH_BASE');

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: TRUELAYER_CLIENT_ID,
    client_secret: TRUELAYER_CLIENT_SECRET,
    scope: 'payments'
  });

  const response = await fetch(`${TRUELAYER_AUTH_BASE}/connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token error: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function createPayment(amountMinor) {
  requireEnv('TRUELAYER_API_BASE');
  requireEnv('TRUELAYER_MERCHANT_ACCOUNT_ID');

  const accessToken = await getAccessToken();
  const currency = TRUELAYER_CURRENCY || 'GBP';
  const userId = `donor-${crypto.randomUUID()}`;

  const paymentBody = {
    amount_in_minor: amountMinor,
    currency,
    payment_method: {
      type: 'bank_transfer',
      provider_selection: { type: 'user_selected' }
    },
    beneficiary: {
      type: 'merchant_account',
      merchant_account_id: TRUELAYER_MERCHANT_ACCOUNT_ID
    },
    user: { id: userId },
    reference: 'Donation'
  };

  if (TRUELAYER_REDIRECT_URI) {
    paymentBody.redirect_uri = TRUELAYER_REDIRECT_URI;
  }

  const response = await fetch(`${TRUELAYER_API_BASE}/payments`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(paymentBody)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Payment error: ${response.status} ${JSON.stringify(data)}`);
  }

  let paymentUrl =
    data?.next_action?.uri ||
    data?.authorization_flow?.redirect?.uri ||
    data?.payment_url;

  if (!paymentUrl && data?.id && data?.resource_token && TRUELAYER_HPP_BASE) {
    paymentUrl = `${TRUELAYER_HPP_BASE}?payment_id=${data.id}&resource_token=${data.resource_token}`;
  }

  return { paymentUrl, raw: data };
}

app.post('/api/create-payment', async (req, res) => {
  try {
    const fallback = Number(DEFAULT_DONATION_MINOR || 1000);
    const amountMinor = Number(req.body?.amount_minor || fallback);
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      return res.status(400).json({ error: 'Invalid amount_minor' });
    }

    const { paymentUrl, raw } = await createPayment(amountMinor);
    if (!paymentUrl) {
      return res.status(500).json({
        error: 'Missing payment_url from TrueLayer response',
        details: raw
      });
    }

    return res.json({ payment_url: paymentUrl });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/webhook', express.json({ type: 'application/json' }), (req, res) => {
  // TODO: Verify TrueLayer webhook signature before processing.
  console.log('Webhook received:', req.body);
  res.sendStatus(200);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const port = Number(PORT || 3000);
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
