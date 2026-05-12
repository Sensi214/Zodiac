# Frontend Handoff (Zodiac API)

## Base URL
- Production: `https://zodiac-1-gj38.onrender.com`

## Endpoints

### 1) Health
- `GET /health`
- Response:
```json
{ "ok": true }
```

### 2) Meta/bootstrap
- `GET /api/meta`
- Response:
```json
{
  "experiences": ["aura", "zodiac", "tarot", "full_artifact"],
  "tarotCards": ["fool"]
}
```

### 3) Birthday candle offer
- `POST /api/birthday-candle-offer`
- Request:
```json
{
  "recipientName": "Harold",
  "birthMonth": 5,
  "birthDay": 9,
  "birthYear": 1990,
  "tarotCard": "fool"
}
```
- Returns candle recommendation and scent profile.

### 4) Mini reading sale
- `POST /api/mini-reading-sale`
- Request:
```json
{
  "name": "Harold",
  "birthMonth": 5,
  "birthDay": 9,
  "birthYear": 1990,
  "tarotCard": "fool"
}
```
- Returns reading summary + suggested candle.

### 5) Create checkout
- `POST /api/create-checkout`
- Request for mini reading:
```json
{ "productType": "mini_reading" }
```
- Request for full artifact:
```json
{ "productType": "full_artifact" }
```
- Response:
```json
{ "url": "https://checkout.stripe.com/..." }
```
- Frontend should redirect to `url`.

## Copy/paste fetch examples

```js
const BASE = "https://zodiac-1-gj38.onrender.com";

export async function fetchMiniReadingOffer(payload) {
  const res = await fetch(`${BASE}/api/mini-reading-sale`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.json();
}

export async function fetchBirthdayCandleOffer(payload) {
  const res = await fetch(`${BASE}/api/birthday-candle-offer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.json();
}

export async function createCheckout(productType = "mini_reading") {
  const res = await fetch(`${BASE}/api/create-checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productType })
  });
  const data = await res.json();
  if (data.url) window.location.href = data.url;
  return data;
}
```

## Webhook verification
1. Stripe Dashboard → Developers → Webhooks.
2. Add endpoint: `https://zodiac-1-gj38.onrender.com/webhook`.
3. Subscribe to: `checkout.session.completed`.
4. Set Render env var: `STRIPE_WEBHOOK_SECRET=whsec_...`.
5. Redeploy and verify webhook deliveries return HTTP 200.

## Success-page behavior
- Stripe success URL points to `/success.html?session_id=...`
- `success.html` stores `session_id` into `localStorage.flame_session_id`
- Then redirects user back to WordPress artifact page.

## Launch checklist
- [ ] Env vars set in Render:
  - `STRIPE_SECRET_KEY`
  - `OPENAI_API_KEY`
  - `WORDPRESS_URL`
  - `BASE_URL`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_MINI_READING_PRICE_ID`
  - `STRIPE_FULL_ARTIFACT_PRICE_ID`
- [ ] `/health` returns 200.
- [ ] `/api/meta` returns expected lists.
- [ ] `/api/mini-reading-sale` returns 200.
- [ ] `/api/create-checkout` returns Stripe URL for mini + full.
- [ ] Stripe webhook delivery shows 200.
