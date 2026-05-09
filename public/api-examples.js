export async function createMiniReadingCheckout(baseUrl) {
  const res = await fetch(`${baseUrl}/api/create-checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productType: "mini_reading" })
  });
  return res.json();
}

export async function fetchMiniReadingOffer(baseUrl, payload) {
  const res = await fetch(`${baseUrl}/api/mini-reading-sale`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.json();
}

export async function fetchBirthdayCandleOffer(baseUrl, payload) {
  const res = await fetch(`${baseUrl}/api/birthday-candle-offer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return res.json();
}
