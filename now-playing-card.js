const LitElement = Object.getPrototypeOf(
  customElements.get("ha-panel-lovelace")
);
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

// States that mean "actively doing something" — show the card
const ACTIVE_STATES = ["playing", "paused", "buffering"];

// Content type display names and icons
const CONTENT_TYPES = {
  movie: { label: "Movie", icon: "🎬" },
  tvshow: { label: "TV Show", icon: "📺" },
  episode: { label: "Episode", icon: "📺" },
  music: { label: "Music", icon: "🎵" },
  video: { label: "Video", icon: "🎞" },
  channel: { label: "Channel", icon: "📡" },
  playlist: { label: "Playlist", icon: "🎶" },
  game: { label: "Game", icon: "🎮" },
  app: { label: "App", icon: "📱" },
  podcast: { label: "Podcast", icon: "🎙" },
};

// SVG icons for no-artwork backgrounds
const NO_ART_ICONS = {
  movie: '<path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>',
  tvshow: '<path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/>',
  episode: '<path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/>',
  music: '<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>',
  game: '<path d="M21.58 16.09l-1.09-7.66A3.996 3.996 0 0016.53 5H7.47C5.82 5 4.4 6.2 4.11 7.83L3.02 15.5A3.015 3.015 0 006 19c1.14 0 2.21-.65 2.73-1.67L10 15h4l1.27 2.33A3.013 3.013 0 0018 19c1.84 0 3.25-1.67 2.98-3.49l-.4-.42zM9 10H7v2H6v-2H4V9h2V7h1v2h2v1zm4.5 2c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm2.5-2c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>',
  default: '<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>',
};

class NowPlayingCard extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      config: { type: Object },
      _currentPosition: { type: Number },
      _artworkError: { type: Boolean },
    };
  }

  static getConfigElement() {
    return document.createElement("now-playing-card-editor");
  }

  static getStubConfig() {
    return {
      entities: [],
      background_opacity: 0.5,
      card_height: 300,
    };
  }

  constructor() {
    super();
    this._currentPosition = 0;
    this._progressInterval = null;
    this._artworkError = false;
    this._lastArtworkUrl = "";
  }

  setConfig(config) {
    if (!config.entities || !Array.isArray(config.entities)) {
      throw new Error("You need to define 'entities' as an array");
    }
    this.config = {
      background_opacity: 0.5,
      card_height: 300,
      idle_text: "Nothing playing",
      idle_subtext: "Media will appear here when something starts",
      show_idle: true,
      show_progress: true,
      show_timestamps: true,
      show_summary: false,
      ...config,
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this._startProgressTimer();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._stopProgressTimer();
  }

  _startProgressTimer() {
    this._stopProgressTimer();
    this._progressInterval = setInterval(() => {
      const result = this._getActivePlayer();
      if (result && result.state.state === "playing") {
        const attrs = result.state.attributes;
        if (
          attrs.media_position != null &&
          attrs.media_position_updated_at
        ) {
          const updatedAt = new Date(
            attrs.media_position_updated_at
          ).getTime();
          const elapsed = (Date.now() - updatedAt) / 1000;
          // Sanity check: if elapsed is > 1 hour, position_updated_at is stale
          if (elapsed < 3600) {
            this._currentPosition = attrs.media_position + elapsed;
          } else {
            this._currentPosition = attrs.media_position;
          }
          this.requestUpdate();
        }
      }
    }, 1000);
  }

  _stopProgressTimer() {
    if (this._progressInterval) {
      clearInterval(this._progressInterval);
      this._progressInterval = null;
    }
  }

  getCardSize() {
    return 4;
  }

  _formatTime(seconds) {
    if (seconds == null || isNaN(seconds) || seconds < 0) return "";
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    }
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  _getActivePlayer() {
    if (!this.hass) return null;

    for (const entry of this.config.entities) {
      const entityId =
        typeof entry === "string" ? entry : entry.entity;
      const matchApp =
        typeof entry === "object" ? entry.match_app : null;
      const label =
        typeof entry === "object" ? entry.label : null;

      if (matchApp) {
        const pattern = new RegExp(
          "^" + matchApp.replace(/\*/g, ".*") + "$"
        );
        const candidates = Object.keys(this.hass.states)
          .filter((eid) => pattern.test(eid))
          .map((eid) => this.hass.states[eid])
          .filter((s) => ACTIVE_STATES.indexOf(s.state) !== -1);

        if (candidates.length > 0) {
          // If multiple matches, prefer the most recently updated
          candidates.sort((a, b) => {
            const aTime = a.attributes.media_position_updated_at
              ? new Date(a.attributes.media_position_updated_at).getTime()
              : 0;
            const bTime = b.attributes.media_position_updated_at
              ? new Date(b.attributes.media_position_updated_at).getTime()
              : 0;
            return bTime - aTime;
          });
          return { state: candidates[0], label: label, isWildcard: true };
        }
      } else {
        const stateObj = this.hass.states[entityId];
        if (stateObj && ACTIVE_STATES.indexOf(stateObj.state) !== -1) {
          return { state: stateObj, label: label, isWildcard: false };
        }
      }
    }
    return null;
  }

  _getContentTypeInfo(contentType) {
    if (!contentType) return null;
    const key = contentType.toLowerCase();
    return CONTENT_TYPES[key] || { label: contentType.charAt(0).toUpperCase() + contentType.slice(1), icon: "📀" };
  }

  _getNoArtIcon(contentType) {
    if (!contentType) return NO_ART_ICONS.default;
    const key = contentType.toLowerCase();
    return NO_ART_ICONS[key] || NO_ART_ICONS.default;
  }

  _buildTitleDisplay(attrs) {
    const title = attrs.media_title || "";
    const seriesTitle = attrs.media_series_title || "";
    const season = attrs.media_season;
    const episode = attrs.media_episode;
    const contentType = (attrs.media_content_type || "").toLowerCase();

    // TV episode: "Series Name — S01E03 · Episode Title"
    if (seriesTitle && (contentType === "episode" || contentType === "tvshow")) {
      let epCode = "";
      if (season != null && episode != null) {
        epCode = `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
      }
      return {
        primary: seriesTitle,
        secondary: epCode ? `${epCode} · ${title}` : title,
      };
    }

    // Everything else: just the title
    return { primary: title, secondary: "" };
  }

  render() {
    // ── Conditional visibility ──
    if (this.config.hide_if && this.hass) {
      const hideEntity = this.config.hide_if.entity;
      const hideStates = this.config.hide_if.state_not
        ? null
        : this.config.hide_if.state || [];
      const hideStatesNot = this.config.hide_if.state_not || null;
      if (hideEntity) {
        const entityState = this.hass.states[hideEntity];
        const currentState = entityState ? entityState.state : "unavailable";
        if (hideStatesNot) {
          // Hide when entity is NOT in these states
          const notList = Array.isArray(hideStatesNot) ? hideStatesNot : [hideStatesNot];
          if (notList.indexOf(currentState) === -1) return html``;
        } else if (hideStates) {
          // Hide when entity IS in these states
          const stateList = Array.isArray(hideStates) ? hideStates : [hideStates];
          if (stateList.indexOf(currentState) !== -1) return html``;
        }
      }
    }

    const result = this._getActivePlayer();

    // ── Idle state ──
    if (!result) {
      if (!this.config.show_idle) return html``;
      const height = this.config.card_height;
      return html`
        <ha-card>
          <div class="container" style="height: ${height}px;">
            <div class="idle-bg"></div>
            <div class="idle-content">
              <div class="idle-icon-ring">
                <svg viewBox="0 0 24 24" width="36" height="36">
                  <path
                    fill="rgba(255,255,255,0.25)"
                    d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
                  />
                </svg>
              </div>
              <div class="idle-text">
                ${this.config.idle_text}
              </div>
              <div class="idle-subtext">
                ${this.config.idle_subtext}
              </div>
            </div>
          </div>
        </ha-card>
      `;
    }

    // ── Active state ──
    const stateObj = result.state;
    const attrs = stateObj.attributes;
    const artwork = attrs.entity_picture || "";
    const rating = attrs.media_content_rating || "";
    const contentType = attrs.media_content_type || "";
    const app = attrs.app_name || "";
    const summary = attrs.media_summary || "";
    const username = attrs.username || "";
    const artist = attrs.media_artist || "";
    const album = attrs.media_album_name || "";
    const playerState = stateObj.state;
    const height = this.config.card_height;
    const opacity = this.config.background_opacity;

    // Title logic (handles TV episodes with series/season/episode)
    const titleInfo = this._buildTitleDisplay(attrs);

    // Device/source name
    const rawFriendlyName = attrs.friendly_name || "";
    let sourceName = result.label || rawFriendlyName;
    let deviceName = "";
    if (result.isWildcard && rawFriendlyName) {
      const parenMatch = rawFriendlyName.match(/\(([^)]+)\)/);
      if (parenMatch) {
        deviceName = parenMatch[1];
      }
    }

    // Progress
    const duration = attrs.media_duration || 0;
    let position = 0;
    if (playerState === "paused") {
      position = attrs.media_position || 0;
    } else if (attrs.media_position != null) {
      position = this._currentPosition || attrs.media_position || 0;
    }
    // Clamp position to duration
    if (duration > 0 && position > duration) position = duration;
    const progress =
      duration > 0 ? Math.min((position / duration) * 100, 100) : 0;

    // Artwork URL
    let artworkUrl = "";
    if (artwork) {
      artworkUrl = artwork.startsWith("/")
        ? `${window.location.origin}${artwork}`
        : artwork;
      // Reset error state if artwork URL changed
      if (artworkUrl !== this._lastArtworkUrl) {
        this._artworkError = false;
        this._lastArtworkUrl = artworkUrl;
      }
    }
    const hasArtwork = artworkUrl && !this._artworkError;

    const isPaused = playerState === "paused";
    const isBuffering = playerState === "buffering";
    const ctInfo = this._getContentTypeInfo(contentType);
    const noArtIconPath = this._getNoArtIcon(contentType);

    // Fallback: if nothing meaningful to show, at least show the source
    const hasMeaningfulContent = titleInfo.primary || artist;

    return html`
      <ha-card>
        <div class="container" style="height: ${height}px;">
          ${hasArtwork
            ? html`
                <div
                  class="artwork"
                  style="background-image: url('${artworkUrl}'); opacity: ${1 - opacity};"
                ></div>
              `
            : html`
                <div class="no-art-bg">
                  <svg
                    class="no-art-icon"
                    viewBox="0 0 24 24"
                    width="120"
                    height="120"
                  >
                    ${this._svgPath(noArtIconPath)}
                  </svg>
                </div>
              `}
          <div class="gradient ${hasArtwork ? "" : "no-art"}"></div>
          <div class="content">
            ${isPaused
              ? html`<div class="state-badge paused-badge">❚❚ PAUSED</div>`
              : ""}
            ${isBuffering
              ? html`<div class="state-badge buffering-badge">
                  LOADING
                </div>`
              : ""}
            <div class="metadata">
              ${hasMeaningfulContent
                ? html`
                    <div class="title-row">
                      <span class="title">${titleInfo.primary}</span>
                      ${rating
                        ? html`<span class="badge rating"
                            >${rating}</span
                          >`
                        : ""}
                      ${ctInfo
                        ? html`<span class="badge content-type"
                            >${ctInfo.label}</span
                          >`
                        : ""}
                    </div>
                    ${titleInfo.secondary
                      ? html`<div class="subtitle">
                          ${titleInfo.secondary}
                        </div>`
                      : ""}
                    ${artist
                      ? html`<div class="artist">
                          ${artist}${album ? html` — ${album}` : ""}
                        </div>`
                      : ""}
                  `
                : html`
                    <div class="title-row">
                      <span class="title">${sourceName}</span>
                      ${ctInfo
                        ? html`<span class="badge content-type"
                            >${ctInfo.label}</span
                          >`
                        : ""}
                    </div>
                    <div class="artist">Playing</div>
                  `}
              <div class="info">
                ${hasMeaningfulContent
                  ? html`<span class="source">${sourceName}</span>`
                  : ""}
                ${deviceName
                  ? html`<span class="sep">·</span
                      ><span>${deviceName}</span>`
                  : ""}
                ${app && !result.isWildcard
                  ? html`<span class="sep">·</span
                      ><span>${app}</span>`
                  : ""}
                ${username
                  ? html`<span class="sep">·</span
                      ><span class="username">${username}</span>`
                  : ""}
              </div>
              ${this.config.show_summary && summary
                ? html`<div class="summary">${summary}</div>`
                : ""}
            </div>
            ${this.config.show_progress && duration > 0
              ? html`
                  <div class="progress-container">
                    ${this.config.show_timestamps
                      ? html`<span class="time"
                          >${this._formatTime(position)}</span
                        >`
                      : ""}
                    <div class="progress-bar">
                      <div
                        class="progress-fill ${isPaused
                          ? "paused"
                          : isBuffering
                            ? "buffering"
                            : ""}"
                        style="width: ${progress}%;"
                      ></div>
                    </div>
                    ${this.config.show_timestamps
                      ? html`<span class="time"
                          >${this._formatTime(duration)}</span
                        >`
                      : ""}
                  </div>
                `
              : ""}
          </div>
        </div>
      </ha-card>
    `;
  }

  // Helper to render SVG path strings in lit-html
  // (lit-html doesn't allow innerHTML in templates for security, so we use this)
  _svgPath(pathStr) {
    const tpl = document.createElement("template");
    tpl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${pathStr}</svg>`;
    const svgEl = tpl.content.firstChild;
    const paths = [];
    for (const child of svgEl.childNodes) {
      if (child.nodeType === 1) {
        paths.push(child);
      }
    }
    // Return as svg template result by re-rendering
    // Since we can't use unsafeHTML without importing it, we use a simpler approach
    return html`<path
      fill="rgba(255,255,255,0.06)"
      d="${pathStr.match(/d="([^"]+)"/)?.[1] || ""}"
    />`;
  }

  static get styles() {
    return css`
      ha-card {
        overflow: hidden;
        padding: 0;
        position: relative;
      }
      .container {
        position: relative;
        overflow: hidden;
      }

      /* ── Artwork ── */
      .artwork {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-size: cover;
        background-position: center center;
        z-index: 0;
        transition: opacity 0.6s ease, background-image 0.6s ease;
      }

      /* ── No-artwork background ── */
      .no-art-bg {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(
          135deg,
          #1a1a2e 0%,
          #16213e 50%,
          #0f3460 100%
        );
        z-index: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .no-art-icon {
        opacity: 0.08;
        transform: scale(1.5);
      }

      /* ── Gradient overlay ── */
      .gradient {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(
          to top,
          rgba(0, 0, 0, 0.92) 0%,
          rgba(0, 0, 0, 0.55) 35%,
          rgba(0, 0, 0, 0.08) 70%,
          transparent 100%
        );
        z-index: 1;
      }
      .gradient.no-art {
        background: linear-gradient(
          to top,
          rgba(0, 0, 0, 0.7) 0%,
          rgba(0, 0, 0, 0.3) 40%,
          transparent 100%
        );
      }

      /* ── Content area ── */
      .content {
        position: relative;
        z-index: 2;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        height: 100%;
        padding: 16px;
        box-sizing: border-box;
      }

      /* ── State badges (top right) ── */
      .state-badge {
        position: absolute;
        top: 12px;
        right: 12px;
        background: rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        color: rgba(255, 255, 255, 0.9);
        font-size: 0.6em;
        font-weight: 700;
        letter-spacing: 0.12em;
        padding: 4px 10px;
        border-radius: 4px;
      }
      .paused-badge {
        animation: pulse 2s ease-in-out infinite;
      }
      .buffering-badge {
        animation: shimmer 1.5s ease-in-out infinite;
      }
      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.4;
        }
      }
      @keyframes shimmer {
        0%,
        100% {
          opacity: 0.6;
        }
        50% {
          opacity: 1;
        }
      }

      /* ── Title row ── */
      .title-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 2px;
      }
      .title {
        font-size: 1.4em;
        font-weight: 700;
        color: white;
        text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
        line-height: 1.2;
      }
      .badge {
        border-radius: 3px;
        padding: 1px 6px;
        font-weight: 600;
        white-space: nowrap;
        flex-shrink: 0;
        vertical-align: middle;
      }
      .rating {
        background: rgba(255, 255, 255, 0.15);
        border: 1px solid rgba(255, 255, 255, 0.3);
        font-size: 0.6em;
        color: rgba(255, 255, 255, 0.85);
        letter-spacing: 0.02em;
      }
      .content-type {
        background: rgba(255, 255, 255, 0.08);
        font-size: 0.55em;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.55);
      }

      /* ── Subtitle (episode info) ── */
      .subtitle {
        font-size: 0.9em;
        color: rgba(255, 255, 255, 0.75);
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
        margin-bottom: 2px;
      }

      /* ── Artist ── */
      .artist {
        font-size: 0.9em;
        color: rgba(255, 255, 255, 0.75);
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
        margin-bottom: 2px;
      }

      /* ── Info line ── */
      .info {
        font-size: 0.75em;
        color: rgba(255, 255, 255, 0.45);
        margin-top: 2px;
      }
      .sep {
        margin: 0 4px;
      }
      .username {
        font-style: italic;
      }

      /* ── Summary ── */
      .summary {
        font-size: 0.72em;
        color: rgba(255, 255, 255, 0.35);
        margin-top: 6px;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      /* ── Progress bar ── */
      .progress-container {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 10px;
      }
      .progress-bar {
        flex: 1;
        height: 3px;
        background: rgba(255, 255, 255, 0.12);
        border-radius: 2px;
        overflow: hidden;
      }
      .progress-fill {
        height: 100%;
        background: rgba(255, 255, 255, 0.8);
        border-radius: 2px;
        transition: width 1s linear;
      }
      .progress-fill.paused {
        background: rgba(255, 255, 255, 0.35);
        transition: none;
      }
      .progress-fill.buffering {
        background: rgba(255, 255, 255, 0.5);
        animation: buffer-pulse 1.5s ease-in-out infinite;
      }
      @keyframes buffer-pulse {
        0%,
        100% {
          opacity: 0.4;
        }
        50% {
          opacity: 1;
        }
      }
      .time {
        font-size: 0.68em;
        color: rgba(255, 255, 255, 0.4);
        font-variant-numeric: tabular-nums;
        min-width: 35px;
        white-space: nowrap;
      }
      .time:last-child {
        text-align: right;
      }

      /* ── Idle state ── */
      .idle-bg {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(
          135deg,
          #1a1a2e 0%,
          #16213e 50%,
          #0f3460 100%
        );
        z-index: 0;
      }
      .idle-content {
        position: relative;
        z-index: 2;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        gap: 10px;
      }
      .idle-icon-ring {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.03);
      }
      .idle-text {
        font-size: 1em;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.35);
        letter-spacing: 0.03em;
      }
      .idle-subtext {
        font-size: 0.72em;
        color: rgba(255, 255, 255, 0.15);
      }
    `;
  }
}

customElements.define("now-playing-card", NowPlayingCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "now-playing-card",
  name: "Now Playing Card",
  description:
    "Shows the highest-priority currently playing media player with artwork and metadata.",
});
