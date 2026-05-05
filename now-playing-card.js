const LitElement = Object.getPrototypeOf(
  customElements.get("ha-panel-lovelace")
);
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

class NowPlayingCard extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      config: { type: Object },
      _currentPosition: { type: Number },
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
  }

  setConfig(config) {
    if (!config.entities || !Array.isArray(config.entities)) {
      throw new Error("You need to define 'entities' as an array");
    }
    this.config = {
      background_opacity: 0.5,
      card_height: 300,
      idle_text: "Nothing playing",
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
        if (attrs.media_position != null && attrs.media_position_updated_at) {
          const updatedAt = new Date(attrs.media_position_updated_at).getTime();
          const elapsed = (Date.now() - updatedAt) / 1000;
          this._currentPosition = attrs.media_position + elapsed;
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
    if (seconds == null || isNaN(seconds)) return "";
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
      const entityId = typeof entry === "string" ? entry : entry.entity;
      const matchApp = typeof entry === "object" ? entry.match_app : null;
      const label = typeof entry === "object" ? entry.label : null;

      if (matchApp) {
        const pattern = new RegExp(
          "^" + matchApp.replace(/\*/g, ".*") + "$"
        );
        const matches = Object.keys(this.hass.states)
          .filter((eid) => pattern.test(eid))
          .map((eid) => this.hass.states[eid])
          .filter(
            (s) => s.state === "playing" || s.state === "paused"
          );
        if (matches.length > 0) {
          return { state: matches[0], label, isWildcard: true };
        }
      } else {
        const stateObj = this.hass.states[entityId];
        if (
          stateObj &&
          (stateObj.state === "playing" || stateObj.state === "paused")
        ) {
          return { state: stateObj, label, isWildcard: false };
        }
      }
    }
    return null;
  }

  render() {
    const result = this._getActivePlayer();

    if (!result) {
      if (!this.config.show_idle) return html``;
      const height = this.config.card_height;
      return html`
        <ha-card>
          <div class="container" style="height: ${height}px;">
            <div class="artwork-placeholder"></div>
            <div class="idle-content">
              <div class="idle-icon">
                <svg viewBox="0 0 24 24" width="48" height="48">
                  <path fill="rgba(255,255,255,0.15)" d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
              </div>
              <div class="idle-text">${this.config.idle_text || "Nothing playing"}</div>
              <div class="idle-subtext">Media will appear here when something starts</div>
            </div>
          </div>
        </ha-card>
      `;
    }

    const stateObj = result.state;
    const attrs = stateObj.attributes;
    const title = attrs.media_title || "";
    const artist = attrs.media_artist || "";
    const album = attrs.media_album_name || "";
    const artwork = attrs.entity_picture || "";
    const rating = attrs.media_content_rating || "";
    const contentType = attrs.media_content_type || "";
    const app = attrs.app_name || "";
    const summary = attrs.media_summary || "";
    const username = attrs.username || "";
    const playerState = stateObj.state;
    const height = this.config.card_height;
    const opacity = this.config.background_opacity;

    // Device/source name logic
    // For match_app entries (e.g. Plex), extract device from friendly_name parenthetical
    // For regular entries, the label IS the device
    const rawFriendlyName = attrs.friendly_name || "";
    let sourceName = result.label || rawFriendlyName;
    let deviceName = "";
    if (result.isWildcard && rawFriendlyName) {
      // Extract device info from parenthetical, e.g. "Plex (Plex Web - Chrome - OSX)"
      const parenMatch = rawFriendlyName.match(/\(([^)]+)\)/);
      if (parenMatch) {
        deviceName = parenMatch[1];
      }
    }

    // Progress calculation
    const duration = attrs.media_duration || 0;
    const position =
      playerState === "paused"
        ? attrs.media_position || 0
        : this._currentPosition || attrs.media_position || 0;
    const progress = duration > 0 ? Math.min((position / duration) * 100, 100) : 0;

    const artworkUrl = artwork
      ? artwork.startsWith("/")
        ? `${window.location.origin}${artwork}`
        : artwork
      : "";

    const isPaused = playerState === "paused";

    return html`
      <ha-card>
        <div class="container" style="height: ${height}px;">
          ${artworkUrl
            ? html`
                <div
                  class="artwork"
                  style="background-image: url('${artworkUrl}'); opacity: ${1 - opacity};"
                ></div>
              `
            : html`<div class="artwork-placeholder"></div>`}
          <div class="gradient"></div>
          <div class="content">
            ${isPaused
              ? html`<div class="paused-badge">❚❚ PAUSED</div>`
              : ""}
            <div class="metadata">
              <div class="title-row">
                <span class="title">${title}</span>
                ${rating
                  ? html`<span class="rating">${rating}</span>`
                  : ""}
                ${contentType
                  ? html`<span class="content-type-badge">${contentType.charAt(0).toUpperCase() + contentType.slice(1)}</span>`
                  : ""}
              </div>
              ${artist
                ? html`<div class="artist">
                    ${artist}${album ? html` — ${album}` : ""}
                  </div>`
                : ""}
              <div class="info">
                <span class="source">${sourceName}</span>
                ${deviceName
                  ? html`<span class="separator">·</span><span class="device">${deviceName}</span>`
                  : ""}
                ${app && !result.isWildcard
                  ? html`<span class="separator">·</span><span class="app">${app}</span>`
                  : ""}
                ${username
                  ? html`<span class="separator">·</span><span class="username">${username}</span>`
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
                      ? html`<span class="time">${this._formatTime(position)}</span>`
                      : ""}
                    <div class="progress-bar">
                      <div
                        class="progress-fill ${isPaused ? "paused" : ""}"
                        style="width: ${progress}%;"
                      ></div>
                    </div>
                    ${this.config.show_timestamps
                      ? html`<span class="time">${this._formatTime(duration)}</span>`
                      : ""}
                  </div>
                `
              : ""}
          </div>
        </div>
      </ha-card>
    `;
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
      .artwork {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-size: cover;
        background-position: center center;
        z-index: 0;
        transition: opacity 0.5s ease;
      }
      .artwork-placeholder {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(
          135deg,
          rgba(40, 40, 60, 0.95),
          rgba(20, 20, 35, 0.98)
        );
        z-index: 0;
      }
      .gradient {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(
          to top,
          rgba(0, 0, 0, 0.92) 0%,
          rgba(0, 0, 0, 0.6) 35%,
          rgba(0, 0, 0, 0.1) 70%,
          transparent 100%
        );
        z-index: 1;
      }
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

      /* Paused badge */
      .paused-badge {
        position: absolute;
        top: 12px;
        right: 12px;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        color: rgba(255, 255, 255, 0.9);
        font-size: 0.65em;
        font-weight: 700;
        letter-spacing: 0.1em;
        padding: 4px 10px;
        border-radius: 4px;
        animation: pulse 2s ease-in-out infinite;
      }
      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }

      /* Title row with badges */
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
      .rating {
        background: rgba(255, 255, 255, 0.15);
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 3px;
        padding: 1px 6px;
        font-size: 0.65em;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.85);
        letter-spacing: 0.02em;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .content-type-badge {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        padding: 1px 6px;
        font-size: 0.6em;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.6);
        white-space: nowrap;
        flex-shrink: 0;
      }

      /* Artist */
      .artist {
        font-size: 0.95em;
        color: rgba(255, 255, 255, 0.85);
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
        margin-bottom: 2px;
      }

      /* Info line */
      .info {
        font-size: 0.78em;
        color: rgba(255, 255, 255, 0.5);
        margin-top: 2px;
      }
      .separator {
        margin: 0 4px;
      }
      .username {
        font-style: italic;
      }

      /* Summary */
      .summary {
        font-size: 0.75em;
        color: rgba(255, 255, 255, 0.4);
        margin-top: 6px;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      /* Progress bar */
      .progress-container {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 10px;
      }
      .progress-bar {
        flex: 1;
        height: 3px;
        background: rgba(255, 255, 255, 0.15);
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
        background: rgba(255, 255, 255, 0.4);
        transition: none;
      }
      .time {
        font-size: 0.7em;
        color: rgba(255, 255, 255, 0.45);
        font-variant-numeric: tabular-nums;
        min-width: 35px;
        white-space: nowrap;
      }
      .time:last-child {
        text-align: right;
      }

      /* Idle */
      .idle-content {
        position: relative;
        z-index: 2;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        gap: 8px;
      }
      .idle-icon {
        opacity: 0.6;
      }
      .idle-text {
        font-size: 1.1em;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.4);
        letter-spacing: 0.02em;
      }
      .idle-subtext {
        font-size: 0.75em;
        color: rgba(255, 255, 255, 0.2);
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
