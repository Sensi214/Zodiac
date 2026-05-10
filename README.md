# Zodiac API

## New flows
- `POST /api/birthday-candle-offer`
- `POST /api/mini-reading-sale`
- `POST /api/create-checkout` with `productType` (`full_artifact` or `mini_reading`)
- `GET /api/admin/analytics?key=...`

## Environment notes
Required: `STRIPE_SECRET_KEY`, `OPENAI_API_KEY`, `WORDPRESS_URL`.
Optional: `BASE_URL` (auto-derived from request host when missing), `STRIPE_WEBHOOK_SECRET` (required only for webhook verification).

See `public/api-examples.js` for frontend fetch examples.

- New hosted starter page: `/full-experience.html` (preview + checkout + paid render flow).
