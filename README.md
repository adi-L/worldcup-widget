# ⚽ World Cup Widget

A small, embeddable [Lit](https://lit.dev) web component that shows the current
(or most recent) FIFA World Cup match with its score, plus the next fixture.
No build step, no API key.

Data comes from [TheSportsDB](https://www.thesportsdb.com) free tier
(league `4429` = FIFA World Cup).

## Embed it anywhere

Drop two lines onto any page:

```html
<script type="module" src="https://your-host.com/worldcup-widget.js"></script>
<worldcup-widget></worldcup-widget>
```

That's it. Lit is loaded from a CDN inside the component, so there's nothing to
install or bundle.

### Attributes

| Attribute  | Default        | Description                                             |
| ---------- | -------------- | ------------------------------------------------------- |
| `league`   | `4429`         | TheSportsDB league id (4429 = FIFA World Cup)           |
| `interval` | `60`           | Refresh interval, in seconds                            |
| `endpoint` | —              | Optional caching-proxy URL (see below). Recommended for public embeds. |
| `variant`  | `full`         | `full` = the card. `mini` = a small pill/button that expands to the full card on click. |
| `position` | `embedded`     | `embedded` (inline), `fixed` (floats over the page), or `absolute`. |
| `corner`   | `bottom-right` | Where it floats when `fixed`/`absolute`: `bottom-right`, `bottom-left`, `top-right`, `top-left`. |

```html
<worldcup-widget league="4429" interval="30"></worldcup-widget>
```

## Variants & positioning

**Full card, inline** (default):

```html
<worldcup-widget></worldcup-widget>
```

**Mini pill that expands on click** (inline):

```html
<worldcup-widget variant="mini"></worldcup-widget>
```

**Floating launcher** — a small pill pinned to a page corner (like a chat
bubble) that pops open the full card in place:

```html
<worldcup-widget variant="mini" position="fixed" corner="bottom-right"></worldcup-widget>
```

The mini pill shows the live score when a match is on, otherwise the live
countdown to the next kick-off. Clicking it opens the full card with a close
(×) button; clicking × collapses back to the pill.

## Two ways to run it

**1. Direct (free, no backend)** — the default. The browser calls TheSportsDB's
free tier directly. Perfect for personal sites and moderate traffic. Zero infra.

**2. Proxy mode (recommended for public / high-traffic embeds)** — point the
widget at a tiny caching proxy so a viral spike can't hit rate limits, and so a
paid API key (if you add live scores) stays server-side and secret.

```html
<worldcup-widget endpoint="https://worldcup-proxy.<you>.workers.dev"></worldcup-widget>
```

The proxy is a ~20-line Cloudflare Worker in [`worker/`](./worker/) — free to
deploy, caches for 2 minutes, and holds any API key as an encrypted secret.
See [`worker/README-worker.md`](./worker/README-worker.md) for the 3-minute
deploy. Rate limits are enforced **per IP**, so caching in one shared proxy is
what keeps you safe under load.

### Theming

Override the CSS custom properties from the host page:

```css
worldcup-widget {
  --wc-accent: #ffd400;
  --wc-bg: #101010;
  width: 360px;
}
```

## Run the demo locally

The component is an ES module, so open it through a server (not `file://`):

```bash
npx serve .
# then open http://localhost:3000
```

## Note on live scores

TheSportsDB's **free** tier does not expose real-time in-play scores. A match
that has kicked off but isn't finished is shown as **LIVE**; its final score
appears once the match reaches full-time. For true minute-by-minute scores,
upgrade to their premium livescore endpoint (v2) and swap the fetch in
`worldcup-widget.js`.
