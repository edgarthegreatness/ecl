# Lead Desk

A private inbox for Facebook Page leads. It collects Lead Ads form submissions, Page messages and post comments from all your Pages. For each one it drafts a reply, and **sends only when you tap Send**. It also saves every lead to a Google Sheet, emails you an alert, and reminds you to follow up.

- **Setup (start here):** [SETUP.md](SETUP.md)
- **Design:** [docs/DESIGN.md](docs/DESIGN.md)
- **Try it with made-up data:** open your site with `?demo` at the end, e.g. `https://your-site.netlify.app/?demo`

## How it's built
- `public/`: the app screens (plain HTML, CSS and JS)
- `netlify/functions/`: the back end on Netlify:
  - `auth`: Facebook sign-in
  - `webhook`: leads from Facebook
  - `api`: what the screens call
  - `followups`: runs every 15 minutes
- `lib/core/`: lead rules (pure JavaScript, unit-tested)
- `lib/svc/`: Facebook, Google Sheets, Gmail and storage connections

## Tests
macOS: `sh tests/run.sh` (unit tests) and `sh tests/syntax.sh` (syntax check). These use the built-in JavaScriptCore shell, so they don't need Node.
