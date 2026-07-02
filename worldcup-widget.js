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
    this._tick = setInterval(() => (this._now = Date.now()), 1000);
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

  _ts(e) {
    return new Date(e.strTimestamp || `${e.dateEvent}T${e.strTime || '00:00:00'}`).getTime();
  }

  _score(v) {
    return v === null || v === undefined || v === '' ? '–' : v;
  }

  _countdown(e) {
    const diff = this._ts(e) - this._now;
    if (diff <= 0) return 'Kicking off';
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (d > 0) return `in ${d}d ${h}h`;
    if (h > 0) return `in ${h}h ${m}m`;
    return `in ${m}m`;
  }

  _kickoff(e) {
    const dt = new Date(this._ts(e));
    return dt.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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

  render() {
    if (this._loading && !this._featured) {
      return html`<div class="card"><div class="loading">Loading World Cup…</div></div>`;
    }
    if (this._error && !this._featured) {
      return html`<div class="card"><div class="loading">${this._error}</div></div>`;
    }

    const f = this._featured;
    const n = this._next;

    return html`
      <div class="card">
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
              <section class="next">
                <div class="next-label">Up Next · ${this._countdown(n)}</div>
                <div class="next-row">
                  ${this._team(n.strHomeTeam, n.strHomeTeamBadge)}
                  <span class="vs">vs</span>
                  ${this._team(n.strAwayTeam, n.strAwayTeamBadge)}
                </div>
                <div class="next-time">${this._kickoff(n)}</div>
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
    .card {
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
  `;
}

customElements.define('worldcup-widget', WorldCupWidget);
