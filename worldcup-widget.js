import { LitElement, html, css } from 'https://esm.run/lit';

/**
 * <worldcup-widget> — a small, embeddable FIFA World Cup scoreboard.
 *
 * Data: TheSportsDB free tier (no API key). League 4429 = FIFA World Cup.
 * Shows the current/most-recent match with score + the next fixture.
 *
 * Attributes:
 *   league   — TheSportsDB league id (default 4429, FIFA World Cup)
 *   interval — refresh interval in seconds (default 60)
 *   endpoint — optional URL of a caching proxy (Cloudflare Worker) that
 *              returns { featured, next }. When set, the widget calls this one
 *              URL instead of TheSportsDB directly — recommended for public /
 *              high-traffic embeds so a viral spike can't hit rate limits, and
 *              required if you use a paid API key (kept server-side).
 *   variant  — 'full' (default, the card) or 'mini' (a small pill/button that
 *              expands into the full card on click).
 *   position — 'embedded' (default, inline), 'fixed' (floats over the page), or
 *              'absolute' (positioned within the nearest positioned ancestor).
 *   corner   — where it sits when floating: 'bottom-right' (default),
 *              'bottom-left', 'top-right', 'top-left'.
 *
 * Note: TheSportsDB's free tier does not expose real-time in-play scores.
 * A match kicked-off-but-not-finished is shown as LIVE; its final score
 * appears once the match reaches full-time.
 */
const API = 'https://www.thesportsdb.com/api/v1/json/3';
const LIVE_WINDOW_MIN = 150; // treat a kicked-off match as live for ~2.5h

export class WorldCupWidget extends LitElement {
  static properties = {
    league: { type: String },
    interval: { type: Number },
    endpoint: { type: String },
    variant: { type: String, reflect: true }, // 'full' | 'mini'
    position: { type: String, reflect: true }, // 'embedded' | 'fixed' | 'absolute'
    corner: { type: String, reflect: true }, // bottom-right | bottom-left | top-right | top-left
    _open: { state: true },
    _featured: { state: true },
    _next: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _now: { state: true },
  };

  constructor() {
    super();
    this.league = '4429';
    this.interval = 60;
    this.endpoint = '';
    this.variant = 'full';
    this.position = 'embedded';
    this.corner = 'bottom-right';
    this._open = false;
    this._fired = new Set(); // event ids we've already refreshed at kick-off
    this._featured = null;
    this._next = null;
    this._loading = true;
    this._error = '';
    this._now = Date.now();
  }

  connectedCallback() {
    super.connectedCallback();
    this._load();
    this._poll = setInterval(() => this._load(), this.interval * 1000);
    this._tick = setInterval(() => {
      this._now = Date.now();
      this._checkKickoff();
    }, 1000);
  }

  // When the next match reaches kick-off, refresh once so it can move into the
  // live/featured slot. Guarded so it fires a single time per match.
  _checkKickoff() {
    const n = this._next;
    if (n && !this._fired.has(n.idEvent) && this._ts(n) - this._now <= 0) {
      this._fired.add(n.idEvent);
      this._load();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._poll);
    clearInterval(this._tick);
  }

  async _load() {
    // Proxy mode: one cached URL that returns { featured, next }.
    if (this.endpoint) {
      try {
        const url = `${this.endpoint}${this.endpoint.includes('?') ? '&' : '?'}league=${this.league}`;
        const data = await fetch(url).then((r) => r.json());
        this._featured = data.featured || null;
        this._next = data.next || null;
        this._error = '';
      } catch (err) {
        this._error = 'Could not load match data.';
      } finally {
        this._loading = false;
      }
      return;
    }

    // Direct mode (free, no backend): call TheSportsDB and compute here.
    try {
      const [pastRes, nextRes] = await Promise.all([
        fetch(`${API}/eventspastleague.php?id=${this.league}`).then((r) => r.json()),
        fetch(`${API}/eventsnextleague.php?id=${this.league}`).then((r) => r.json()),
      ]);
      const past = (pastRes.events || []).sort(
        (a, b) => this._ts(b) - this._ts(a)
      );
      const upcoming = (nextRes.events || []).sort(
        (a, b) => this._ts(a) - this._ts(b)
      );

      const now = Date.now();
      // A match is "live" if it's in the upcoming feed, has kicked off, and
      // isn't finished yet.
      const live = upcoming.find((e) => {
        const t = this._ts(e);
        return (
          t <= now &&
          now - t < LIVE_WINDOW_MIN * 60000 &&
          (e.strStatus || '').toUpperCase() !== 'FT'
        );
      });

      this._featured = live
        ? { ...live, live: true }
        : past[0]
        ? { ...past[0], live: false }
        : null;

      // Next = earliest upcoming that isn't the live/featured one.
      this._next = upcoming.find((e) => e.idEvent !== this._featured?.idEvent) || null;

      this._error = '';
    } catch (err) {
      this._error = 'Could not load match data.';
    } finally {
      this._loading = false;
    }
  }

  // TheSportsDB timestamps are UTC but omit the timezone marker, so JS would
  // otherwise parse them as the viewer's local time. Tag as UTC → one true
  // kick-off instant that renders correctly in every visitor's own timezone.
  _ts(e) {
    let s = e.strTimestamp || `${e.dateEvent}T${e.strTime || '00:00:00'}`;
    if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z';
    return new Date(s).getTime();
  }

  _score(v) {
    return v === null || v === undefined || v === '' ? '–' : v;
  }

  // Returns a live countdown string, or null once kick-off is reached.
  // Shows seconds when under an hour so it visibly ticks down.
  _countdown(e) {
    const diff = this._ts(e) - this._now;
    if (diff <= 0) return null;
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const pad = (v) => String(v).padStart(2, '0');
    if (d > 0) return `in ${d}d ${h}h ${pad(m)}m`;
    if (h > 0) return `in ${h}h ${pad(m)}m ${pad(s)}s`;
    if (m > 0) return `in ${m}m ${pad(s)}s`;
    return `in ${s}s`;
  }

  // Renders in the viewer's own timezone automatically (undefined locale =
  // browser locale), with the tz abbreviation so it's clearly *their* local time.
  _kickoff(e) {
    const dt = new Date(this._ts(e));
    return dt.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  }

  _team(name, badge) {
    return html`
      <div class="team">
        ${badge
          ? html`<img class="badge" src="${badge}" alt="${name}" loading="lazy" />`
          : html`<div class="badge placeholder">${(name || '?').slice(0, 3)}</div>`}
        <span class="name">${name}</span>
      </div>
    `;
  }

  _closeBtn(show) {
    return show
      ? html`<button class="close" @click=${() => (this._open = false)}
          aria-label="Close">×</button>`
      : '';
  }

  render() {
    // Mini variant shows a small launcher button until the user opens it.
    if (this.variant === 'mini' && !this._open) {
      return this._renderLauncher();
    }
    return this._renderCard();
  }

  // Small pill button: live score if a match is on, else the next countdown.
  _renderLauncher() {
    const f = this._featured;
    const n = this._next;
    let label;
    if (f && f.live) {
      label = html`
        <span class="m-pill live"><span class="dot"></span>LIVE</span>
        <span class="m-score">${this._score(f.intHomeScore)}–${this._score(f.intAwayScore)}</span>
      `;
    } else if (n) {
      const cd = this._countdown(n);
      label = html`<span class="m-txt">Next ${cd || 'now'}</span>`;
    } else if (f) {
      label = html`<span class="m-score">${this._score(f.intHomeScore)}–${this._score(f.intAwayScore)}</span>`;
    } else {
      label = html`<span class="m-txt">World Cup</span>`;
    }
    return html`
      <button class="launcher" @click=${() => (this._open = true)}
        aria-label="Open World Cup scoreboard" title="World Cup scoreboard">
        ${f?.strLeagueBadge
          ? html`<img class="m-badge" src="${f.strLeagueBadge}" alt="" />`
          : html`<span class="m-ball">⚽</span>`}
        ${label}
      </button>
    `;
  }

  _renderCard() {
    const closable = this.variant === 'mini';
    if (this._loading && !this._featured) {
      return html`<div class="card">${this._closeBtn(closable)}<div class="loading">Loading World Cup…</div></div>`;
    }
    if (this._error && !this._featured) {
      return html`<div class="card">${this._closeBtn(closable)}<div class="loading">${this._error}</div></div>`;
    }

    const f = this._featured;
    const n = this._next;
    const cd = n ? this._countdown(n) : null;
    const starting = n && cd === null; // kick-off reached, awaiting refresh

    return html`
      <div class="card open">
        ${this._closeBtn(closable)}
        <header>
          ${f?.strLeagueBadge
            ? html`<img class="league-badge" src="${f.strLeagueBadge}" alt="" />`
            : ''}
          <div class="league-name">${f?.strLeague || 'FIFA World Cup'}</div>
        </header>

        ${f
          ? html`
              <section class="featured">
                <div class="status">
                  ${f.live
                    ? html`<span class="pill live"><span class="dot"></span>LIVE</span>`
                    : html`<span class="pill">FULL TIME</span>`}
                </div>
                <div class="matchup">
                  ${this._team(f.strHomeTeam, f.strHomeTeamBadge)}
                  <div class="score">
                    <span>${this._score(f.intHomeScore)}</span>
                    <span class="sep">:</span>
                    <span>${this._score(f.intAwayScore)}</span>
                  </div>
                  ${this._team(f.strAwayTeam, f.strAwayTeamBadge)}
                </div>
                ${f.strVenue ? html`<div class="venue">${f.strVenue}</div>` : ''}
              </section>
            `
          : html`<section class="featured"><div class="venue">No recent match.</div></section>`}

        ${n
          ? html`
              <section class="next ${starting ? 'starting' : ''}">
                <div class="next-label">
                  ${starting
                    ? html`<span class="kick"><span class="ball">⚽</span> Kick-off — starting now!</span>`
                    : html`Up Next · <span class="cd">${cd}</span>`}
                </div>
                <div class="next-row">
                  ${this._team(n.strHomeTeam, n.strHomeTeamBadge)}
                  <span class="vs">vs</span>
                  ${this._team(n.strAwayTeam, n.strAwayTeamBadge)}
                </div>
                <div class="next-time">
                  ${starting ? 'Going live any moment…' : this._kickoff(n)}
                </div>
              </section>
            `
          : ''}
      </div>
    `;
  }

  static styles = css`
    :host {
      --wc-bg: #0b1220;
      --wc-bg2: #131c30;
      --wc-fg: #f4f7fb;
      --wc-muted: #8b98b0;
      --wc-accent: #00d17a;
      --wc-line: rgba(255, 255, 255, 0.08);
      display: inline-block;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      color: var(--wc-fg);
      width: 320px;
      max-width: 100%;
    }
    /* --- Positioning modes --- */
    :host([position='fixed']) {
      position: fixed;
      z-index: 2147483000;
      width: auto;
    }
    :host([position='absolute']) {
      position: absolute;
      z-index: 100;
      width: auto;
    }
    :host([position='fixed'][corner='bottom-right']),
    :host([position='absolute'][corner='bottom-right']) {
      bottom: 20px;
      right: 20px;
    }
    :host([position='fixed'][corner='bottom-left']),
    :host([position='absolute'][corner='bottom-left']) {
      bottom: 20px;
      left: 20px;
    }
    :host([position='fixed'][corner='top-right']),
    :host([position='absolute'][corner='top-right']) {
      top: 20px;
      right: 20px;
    }
    :host([position='fixed'][corner='top-left']),
    :host([position='absolute'][corner='top-left']) {
      top: 20px;
      left: 20px;
    }
    /* When floating, the open card keeps its natural width and sits at the corner */
    :host([position='fixed']) .card,
    :host([position='absolute']) .card {
      width: 320px;
      max-width: calc(100vw - 40px);
    }
    /* --- Mini launcher button --- */
    .launcher {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px 8px 10px;
      border: 1px solid var(--wc-line);
      border-radius: 999px;
      background: linear-gradient(160deg, var(--wc-bg2), var(--wc-bg));
      color: var(--wc-fg);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .launcher:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45);
    }
    .launcher:focus-visible {
      outline: 2px solid var(--wc-accent);
      outline-offset: 2px;
    }
    .m-badge {
      width: 22px;
      height: 22px;
      object-fit: contain;
    }
    .m-ball {
      font-size: 16px;
    }
    .m-score {
      font-variant-numeric: tabular-nums;
      font-weight: 800;
    }
    .m-txt {
      color: var(--wc-fg);
    }
    .m-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      padding: 2px 7px;
      border-radius: 999px;
      background: rgba(0, 209, 122, 0.15);
      color: var(--wc-accent);
    }
    /* --- Close button (mini, when opened) --- */
    .close {
      position: absolute;
      top: 8px;
      right: 10px;
      z-index: 2;
      width: 24px;
      height: 24px;
      border: none;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.08);
      color: var(--wc-fg);
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .close:hover {
      background: rgba(255, 255, 255, 0.18);
    }
    .card.open {
      animation: pop 0.18s ease-out;
    }
    @keyframes pop {
      from { opacity: 0; transform: scale(0.94) translateY(6px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .card {
      position: relative;
      background: linear-gradient(160deg, var(--wc-bg2), var(--wc-bg));
      border: 1px solid var(--wc-line);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    }
    header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--wc-line);
    }
    .league-badge {
      width: 22px;
      height: 22px;
      object-fit: contain;
    }
    .league-name {
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .loading {
      padding: 40px 16px;
      text-align: center;
      color: var(--wc-muted);
      font-size: 14px;
    }
    .featured {
      padding: 18px 16px 16px;
      text-align: center;
    }
    .status {
      margin-bottom: 12px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--wc-muted);
    }
    .pill.live {
      background: rgba(0, 209, 122, 0.15);
      color: var(--wc-accent);
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--wc-accent);
      animation: pulse 1.2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    .matchup {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 8px;
    }
    .team {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .badge {
      width: 46px;
      height: 46px;
      object-fit: contain;
    }
    .badge.placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 50%;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--wc-muted);
    }
    .name {
      font-size: 12px;
      font-weight: 600;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }
    .score {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 34px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .score .sep {
      color: var(--wc-muted);
      font-weight: 500;
    }
    .venue {
      margin-top: 12px;
      font-size: 11px;
      color: var(--wc-muted);
    }
    .next {
      padding: 14px 16px;
      border-top: 1px solid var(--wc-line);
      background: rgba(255, 255, 255, 0.02);
    }
    .next-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--wc-accent);
      margin-bottom: 10px;
    }
    .next-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
    }
    .next-row .team {
      flex-direction: row;
    }
    .next-row .badge {
      width: 24px;
      height: 24px;
    }
    .next-row .name {
      font-size: 13px;
    }
    .vs {
      font-size: 11px;
      color: var(--wc-muted);
      font-weight: 600;
    }
    .next-time {
      margin-top: 10px;
      text-align: center;
      font-size: 11px;
      color: var(--wc-muted);
    }
    /* Tabular digits keep the ticking countdown from jittering side to side. */
    .cd {
      font-variant-numeric: tabular-nums;
    }
    /* Kick-off celebration */
    .next.starting {
      background: rgba(0, 209, 122, 0.1);
      animation: flash 1.4s ease-in-out infinite;
    }
    .kick {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--wc-accent);
    }
    .ball {
      display: inline-block;
      animation: bounce 0.7s ease-in-out infinite;
    }
    @keyframes bounce {
      0%, 100% { transform: translateY(0) rotate(0deg); }
      50% { transform: translateY(-4px) rotate(20deg); }
    }
    @keyframes flash {
      0%, 100% { background: rgba(0, 209, 122, 0.06); }
      50% { background: rgba(0, 209, 122, 0.16); }
    }
    @media (prefers-reduced-motion: reduce) {
      .ball, .next.starting, .dot, .card.open, .launcher { animation: none; transition: none; }
    }
  `;
}

customElements.define('worldcup-widget', WorldCupWidget);
