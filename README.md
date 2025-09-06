# The 3rd Place Cinema Club — Deploy-ready Site

## Deploy
- Drag this folder into https://app.netlify.com/drop, or push to a repo and connect to Netlify.
- In Netlify → Site settings → Domain management, add your custom domain and enforce HTTPS.

## Calendar
- In Google Calendar → Settings → your club calendar:
  - Access permissions → "Make available to public" (or the embed won’t show to visitors).
  - Integrate calendar → copy the Embed URL and paste into the `<iframe src="...">` in index.html.

## Invitation Request (Netlify Forms)
- The form is named **invitation-request**.
- After first deploy, go to Netlify → Forms → enable email notifications.
- Optional spam protection: enable reCAPTCHA v2 in Netlify Forms and add `<div data-netlify-recaptcha="true"></div>` inside the form.

## Background / Favicon
- Replace `assets/favicon.png` for a new favicon (square PNG).
- To change the textured background, edit the CSS in `index.html` under `body::before` (use your own image in /assets).

## Membership
- Copy already states in‑person only; adjust in the Membership section as needed.
