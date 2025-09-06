// netlify/functions/ics.js
// Fetches a public Google Calendar ICS feed from an env var and returns it as text (CORS-enabled).
export async function handler(event, context) {
  const url = process.env.CALENDAR_ICS_URL;
  if (!url) {
    return { statusCode: 500, body: "Missing CALENDAR_ICS_URL env var in Netlify -> Site settings -> Environment variables." };
  }
  try {
    const resp = await fetch(url, { headers: { "User-Agent": "tpc-ics-proxy" } });
    if (!resp.ok) {
      return { statusCode: resp.status, body: `Upstream error: ${resp.statusText}` };
    }
    const text = await resp.text();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300" // 5 min
      },
      body: text
    };
  } catch (e) {
    return { statusCode: 500, body: `Proxy error: ${e.message}` };
  }
}
