# World Cup caching proxy (Cloudflare Worker)

A ~20-line edge proxy that sits between the widget and TheSportsDB. It does two
jobs:

1. **Caching** — fetches upstream once every ~2 minutes and serves that cached
   result to *all* visitors from Cloudflare's edge. A viral spike of 100k
   people becomes a handful of upstream calls, so you never hit the rate limit.
2. **Key security** — if you upgrade to paid live scores, the API key is stored
   as an encrypted Cloudflare **secret** and never reaches the browser.

The free tier needs **no key** — the proxy still gives you the caching benefit.

## Deploy (free, ~3 minutes)

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up).

```bash
cd worker
npx wrangler login        # opens a browser to authorize
npx wrangler deploy       # deploys the Worker
```

Wrangler prints a URL like:

```
https://worldcup-proxy.<your-subdomain>.workers.dev
```

That's your endpoint. Point the widget at it:

```html
<worldcup-widget
  endpoint="https://worldcup-proxy.<your-subdomain>.workers.dev">
</worldcup-widget>
```

Test it directly in a browser or curl:

```bash
curl "https://worldcup-proxy.<your-subdomain>.workers.dev/?league=4429"
# → { "featured": {...}, "next": {...}, "updatedAt": "..." }
```

## Enable real live scores later (paid TheSportsDB plan)

1. Buy the Single Developer plan ($9/mo) and get your API key.
2. Store it as a secret (encrypted, never in git or the browser):

   ```bash
   npx wrangler secret put THESPORTSDB_KEY
   # paste the key when prompted
   ```

3. Redeploy:

   ```bash
   npx wrangler deploy
   ```

The proxy will now overlay real in-play scores. Nothing changes in the widget.

> The v2 livescore path/shape can vary by plan. If scores don't update, adjust
> the endpoint in `overlayLiveScore()` in `worldcup-proxy.js` to match the
> response documented for your plan.

## Free tier limits (Cloudflare)

100,000 requests/day free. Because responses are cached for 2 minutes, even a
very popular embed stays far under this.
