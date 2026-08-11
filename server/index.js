require('dotenv').config();

const cors = require('cors');
const crypto = require('node:crypto');
const express = require('express');
const Stripe = require('stripe');
const { mobileApiRouter } = require('./mobileApi');

// Stripe is optional so the field-app flow can be developed without payment keys.
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

if (!stripe) {
  console.warn('STRIPE_SECRET_KEY is not set. Payment endpoints are disabled.');
}

const app = express();
const port = Number(process.env.PORT || 4242);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/health', (_request, response) => {
  response.json({ ok: true });
});

app.use('/api/v1/mobile', mobileApiRouter);

function requireStripe(response) {
  if (stripe) {
    return true;
  }

  response.status(503).json({ error: 'Stripe is not configured on this server.' });

  return false;
}

app.post('/connection_token', async (_request, response) => {
  if (!requireStripe(response)) {
    return undefined;
  }

  try {
    const connectionToken = await stripe.terminal.connectionTokens.create();
    return response.json({ secret: connectionToken.secret });
  } catch (error) {
    console.error('Stripe Terminal connection token error:', error);
    return response.status(500).json({ error: 'Unable to create a Terminal connection token.' });
  }
});

app.post('/create-payment-intent', async (request, response) => {
  if (!requireStripe(response)) {
    return undefined;
  }

  const amount = Number(request.body?.amount);
  const currency = String(request.body?.currency || 'usd').toLowerCase();

  if (!Number.isInteger(amount) || amount < 50) {
    return response.status(400).json({
      error: 'amount must be an integer in the smallest currency unit and at least 50.'
    });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true }
    });

    return response.json({ paymentIntent: paymentIntent.client_secret });
  } catch (error) {
    console.error('Stripe PaymentIntent error:', error);
    return response.status(500).json({ error: 'Unable to create a payment.' });
  }
});

const DONATION_MIN_CENTS = 100;
const DONATION_MAX_CENTS = 100000;
/** Stripe's shortest allowed session lifetime, and far more than paying at the door takes. */
const PAYMENT_LINK_TTL_SECONDS = 30 * 60;

/**
 * One Checkout Session per donation rather than Stripe's reusable Payment Link:
 * the amount the volunteer agreed on is baked into the URL, and the session is
 * single-use, so it stops working the moment the donor is done with it.
 */
app.post('/create-payment-link', async (request, response) => {
  if (!requireStripe(response)) {
    return undefined;
  }

  const amountCents = Number(request.body?.amount_cents);

  if (
    !Number.isInteger(amountCents) ||
    amountCents < DONATION_MIN_CENTS ||
    amountCents > DONATION_MAX_CENTS
  ) {
    return response.status(400).json({
      error: `amount_cents must be an integer between ${DONATION_MIN_CENTS} and ${DONATION_MAX_CENTS}.`
    });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      submit_type: 'donate',
      expires_at: Math.floor(Date.now() / 1000) + PAYMENT_LINK_TTL_SECONDS,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: amountCents,
            product_data: { name: 'Spende' }
          }
        }
      ],
      metadata: {
        source: 'dio-app-payment-link',
        house_id: String(request.body?.house_id || ''),
        client_uuid: String(request.body?.client_uuid || '')
      }
    });

    return response.json({
      id: session.id,
      url: session.url,
      expiresAt: new Date(session.expires_at * 1000).toISOString()
    });
  } catch (error) {
    console.error('Stripe Checkout Session error:', error);
    return response.status(500).json({ error: 'Unable to create a payment link.' });
  }
});

app.get('/payment-link/:id/status', async (request, response) => {
  if (!requireStripe(response)) {
    return undefined;
  }

  const id = String(request.params.id);

  if (!id.startsWith('cs_')) {
    return response.status(400).json({ error: 'Not a Checkout Session id.' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(id);

    return response.json({
      id: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      amountCents: session.amount_total
    });
  } catch (error) {
    console.error('Stripe Checkout Session lookup error:', error);
    return response.status(404).json({ error: 'Unknown payment link.' });
  }
});

const invoiceRequests = new Map();
const INVOICE_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function invoicePage({ token, amountCents, values = {}, submitted = false, formAction }) {
  const amount = `€ ${(amountCents / 100).toFixed(2).replace('.', ',')}`;
  const action = formAction || `/invoice/${token}`;

  if (submitted) {
    return `<!doctype html>
      <html lang="de"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Spendenbeleg angefragt</title>
      <body style="font-family:system-ui;max-width:560px;margin:40px auto;padding:20px;color:#0f172a">
        <h1>Danke!</h1>
        <p>Die Daten für den Spendenbeleg über <strong>${escapeHtml(amount)}</strong> wurden übermittelt.</p>
        <p>Der Beleg wird später per E-Mail versendet.</p>
      </body></html>`;
  }

  return `<!doctype html>
    <html lang="de"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Spendenbeleg</title>
    <body style="font-family:system-ui;max-width:560px;margin:24px auto;padding:20px;color:#0f172a">
      <h1>Spendenbeleg anfordern</h1>
      <p>Spendenbetrag: <strong>${escapeHtml(amount)}</strong></p>
      <p>Bitte tragen Sie Ihre Daten ein. Der Beleg wird später per E-Mail versendet.</p>
      <form method="post" action="${escapeHtml(action)}">
        <label>Vorname<br><input required name="first_name" value="${escapeHtml(values.first_name)}" style="width:100%;padding:12px;box-sizing:border-box"></label><br>
        <label>Nachname<br><input required name="last_name" value="${escapeHtml(values.last_name)}" style="width:100%;padding:12px;box-sizing:border-box"></label><br>
        <label>E-Mail<br><input required type="email" name="email" value="${escapeHtml(values.email)}" style="width:100%;padding:12px;box-sizing:border-box"></label><br>
        <label>Straße und Hausnummer<br><input name="street" value="${escapeHtml(values.street)}" style="width:100%;padding:12px;box-sizing:border-box"></label><br>
        <label>PLZ<br><input name="postal_code" value="${escapeHtml(values.postal_code)}" style="width:100%;padding:12px;box-sizing:border-box"></label><br>
        <label>Ort<br><input name="city" value="${escapeHtml(values.city)}" style="width:100%;padding:12px;box-sizing:border-box"></label><br>
        <label>Geburtsdatum, falls für die steuerliche Absetzbarkeit benötigt<br><input type="date" name="birth_date" value="${escapeHtml(values.birth_date)}" style="width:100%;padding:12px;box-sizing:border-box"></label><br>
        <label><input type="checkbox" name="tax_receipt_consent" value="true" ${values.tax_receipt_consent === 'true' ? 'checked' : ''}> Ich möchte einen steuerlich verwertbaren Spendenbeleg.</label><br><br>
        <button type="submit" style="background:#2563eb;color:white;border:0;border-radius:8px;padding:14px 18px;font-size:16px">Daten übermitteln</button>
      </form>
    </body></html>`;
}

function publicInvoiceBaseUrl(request) {
  return (process.env.PUBLIC_INVOICE_BASE_URL || `${request.protocol}://${request.get('host')}`).replace(/\/$/, '');
}

app.post('/create-invoice-request', (request, response) => {
  const amountCents = Number(request.body?.amount_cents);

  if (!Number.isInteger(amountCents) || amountCents < DONATION_MIN_CENTS || amountCents > DONATION_MAX_CENTS) {
    return response.status(400).json({
      error: `amount_cents must be an integer between ${DONATION_MIN_CENTS} and ${DONATION_MAX_CENTS}.`
    });
  }

  const token = crypto.randomBytes(18).toString('base64url');
  const expiresAt = new Date(Date.now() + INVOICE_REQUEST_TTL_MS);

  invoiceRequests.set(token, {
    amountCents,
    currency: String(request.body?.currency || 'eur').toLowerCase(),
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: 'open'
  });

  return response.json({
    id: token,
    url: `${publicInvoiceBaseUrl(request)}/invoice/${encodeURIComponent(token)}`,
    expiresAt: expiresAt.toISOString()
  });
});

// Demo-only form route so the QR can be scanned end-to-end while running with
// EXPO_PUBLIC_DEMO_MODE=true. It does not create a durable invoice request.
app.get('/invoice/demo', (request, response) => {
  const amountCents = Number(request.query?.amount_cents);

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return response.status(400).send('<h1>Kein gültiger Betrag.</h1>');
  }

  return response.type('html').send(invoicePage({
    token: 'demo',
    amountCents,
    formAction: `/invoice/demo?amount_cents=${amountCents}`
  }));
});

app.post('/invoice/demo', (request, response) => {
  const amountCents = Number(request.query?.amount_cents);
  const values = {
    first_name: String(request.body?.first_name || '').trim(),
    last_name: String(request.body?.last_name || '').trim(),
    email: String(request.body?.email || '').trim(),
    street: String(request.body?.street || '').trim(),
    postal_code: String(request.body?.postal_code || '').trim(),
    city: String(request.body?.city || '').trim(),
    birth_date: String(request.body?.birth_date || '').trim(),
    tax_receipt_consent: request.body?.tax_receipt_consent === 'true' ? 'true' : 'false'
  };

  if (
    !Number.isInteger(amountCents) ||
    amountCents <= 0 ||
    !values.first_name ||
    !values.last_name ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)
  ) {
    return response.status(400).type('html').send(invoicePage({
      token: 'demo',
      amountCents: Number.isInteger(amountCents) && amountCents > 0 ? amountCents : 0,
      values,
      formAction: `/invoice/demo?amount_cents=${amountCents}`
    }));
  }

  console.log('[invoice-demo] donor details ready for email delivery:', {
    amountCents,
    email: values.email
  });

  return response.type('html').send(invoicePage({ token: 'demo', amountCents, submitted: true }));
});

app.get('/invoice/:token', (request, response) => {
  const invoice = invoiceRequests.get(request.params.token);

  if (!invoice || invoice.expiresAt < new Date().toISOString()) {
    return response.status(404).send('<h1>Dieser Beleg-Link ist nicht mehr gültig.</h1>');
  }

  return response.type('html').send(invoicePage({ token: request.params.token, amountCents: invoice.amountCents }));
});

app.post('/invoice/:token', (request, response) => {
  const invoice = invoiceRequests.get(request.params.token);

  if (!invoice || invoice.expiresAt < new Date().toISOString()) {
    return response.status(404).send('<h1>Dieser Beleg-Link ist nicht mehr gültig.</h1>');
  }

  const values = {
    first_name: String(request.body?.first_name || '').trim(),
    last_name: String(request.body?.last_name || '').trim(),
    email: String(request.body?.email || '').trim(),
    street: String(request.body?.street || '').trim(),
    postal_code: String(request.body?.postal_code || '').trim(),
    city: String(request.body?.city || '').trim(),
    birth_date: String(request.body?.birth_date || '').trim(),
    tax_receipt_consent: request.body?.tax_receipt_consent === 'true' ? 'true' : 'false'
  };

  if (!values.first_name || !values.last_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    return response.status(400).type('html').send(invoicePage({
      token: request.params.token,
      amountCents: invoice.amountCents,
      values
    }));
  }

  const submitted = {
    ...invoice,
    ...values,
    submittedAt: new Date().toISOString(),
    status: 'submitted'
  };
  invoiceRequests.set(request.params.token, submitted);

  // POC hook: replace this log with the church's email provider/queue later.
  console.log('[invoice] donor details ready for email delivery:', {
    id: request.params.token,
    amountCents: submitted.amountCents,
    email: submitted.email
  });

  return response.type('html').send(invoicePage({
    token: request.params.token,
    amountCents: invoice.amountCents,
    submitted: true
  }));
});

app.listen(port, () => {
  console.log(`DIO payments server listening on http://localhost:${port}`);
});
