# ⚽ World Cup Widget

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Built with Lit](https://img.shields.io/badge/built%20with-Lit-324FFF.svg)](https://lit.dev)
[![No build step](https://img.shields.io/badge/build-none-brightgreen.svg)](#embed-it-anywhere)
[![Live demo](https://img.shields.io/badge/demo-live-blue.svg)](https://adi-l.github.io/worldcup-widget/)

A small, embeddable [Lit](https://lit.dev) web component that shows the current
(or most recent) FIFA World Cup match with its score, plus the next fixture —
with a live-ticking countdown to kick-off. **No build step, no API key.**

**▶ Live demo: https://adi-l.github.io/worldcup-widget/**

Data comes from [TheSportsDB](https://www.thesportsdb.com) free tier
(league `4429` = FIFA World Cup).

## Features

- 🟢 **Current / latest match** with score, plus the **next fixture**
- ⏱️ **Live countdown** that ticks to the second and celebrates at kick-off
- 🌍 **Timezone-aware** — kick-off shown in each visitor's local time
- 🗣️ **4 languages** — English, French, Hebrew, Arabic (with full **RTL**)
- 🎛️ **3 layouts** — full card, mini pill, or a floating corner launcher
- 🎨 **Themeable** via CSS custom properties
- 📦 **Zero dependencies to install** — one `<script>` tag and you're done
- 🛡️ Optional caching proxy for high-traffic / paid live-score use

## Embed it anywhere

Drop two lines onto any page — no install, no build. Load it straight from the
[jsDelivr](https://www.jsdelivr.com) CDN:

```html
<script type="module" src="https://cdn.jsdelivr.net/gh/adi-L/worldcup-widget@main/worldcup-widget.js"></script>
<worldcup-widget></worldcup-widget>
```

That's it. Lit is loaded from a CDN inside the component, so there's nothing to
install or bundle. (Prefer to self-host? Just serve `worldcup-widget.js` from
your own domain and point the `src` at it.)

### Attributes

| Attribute  | Default        | Description                                             |
| ---------- | -------------- | ------------------------------------------------------- |
| `league`   | `4429`         | TheSportsDB league id (4429 = FIFA World Cup)           |
| `interval` | `60`           | Refresh interval, in seconds                            |
| `endpoint` | —              | Optional caching-proxy URL (see below). Recommended for public embeds. |
| `variant`  | `full`         | `full` = the card. `mini` = a small pill/button that expands to the full card on click. |
| `position` | `embedded`     | `embedded` (inline), `fixed` (floats over the page), or `absolute`. |
| `corner`   | `bottom-right` | Where it floats when `fixed`/`absolute`: `bottom-right`, `bottom-left`, `top-right`, `top-left`. |
| `lang`     | `en`           | UI language: `en`, `fr`, `he`, `ar`. `he`/`ar` render right-to-left; dates localize automatically. |

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

## Languages

```html
<worldcup-widget lang="en"></worldcup-widget>
<worldcup-widget lang="fr"></worldcup-widget>
<worldcup-widget lang="he"></worldcup-widget>  <!-- right-to-left -->
<worldcup-widget lang="ar"></worldcup-widget>  <!-- right-to-left -->
```

All of the widget's own text — LIVE / FULL TIME, Up Next, the countdown, the
kick-off state — is translated, and **dates render in the chosen language and
the viewer's timezone**. Hebrew and Arabic switch the whole card to RTL
(including the close button). Team and league names come from the API as proper
nouns and are shown as-is.

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
upgrade to their premium livescore endpoint (v2) — set the key as a secret on
the proxy (see [`worker/`](./worker/)); it's never exposed to the browser.

## Contributing

Contributions are welcome! This is a tiny, dependency-free project, so it's easy
to hack on:

1. Fork and clone the repo.
2. `npm start` (runs a static server) and open the demo.
3. Make your change in `worldcup-widget.js` (or `worker/` for the proxy).
4. `npm run check` to lint-syntax both files.
5. Open a pull request describing what and why.

Ideas that would make great PRs: more languages, additional competitions in the
league-name map, an optional goal-flash animation, or a `lang="auto"` mode that
follows the visitor's browser language. Please keep it dependency-free.

Found a bug or have a request? [Open an issue](https://github.com/adi-L/worldcup-widget/issues).

## License

[MIT](./LICENSE) © Adi Levi — free to use, modify, and embed anywhere.
