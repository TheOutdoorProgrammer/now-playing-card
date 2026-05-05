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

  setConfig(config) {
    if (!config.entities || !Array.isArray(config.entities)) {
      throw new Error("You need to define 'entities' as an array");
    }
    this.config = {
      background_opacity: 0.5,
      card_height: 300,
      idle_text: "",
      show_when_idle: false,
      ...config,
    };
  }

  getCardSize() {
    return 4;
  }

  _getActivePlayer() {
    if (!this.hass) return null;

    for (const entry of this.config.entities) {
      // Entry can be a string (entity_id) or an object with entity/label/match_app
      const entityId =
        typeof entry === "string" ? entry : entry.entity;
      const matchApp =
        typeof entry === "object" ? entry.match_app : null;
      const label =
        typeof entry === "object" ? entry.label : null;

      if (matchApp) {
        // Wildcard match: find any entity matching the pattern that is playing/paused
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
          return { state: matches[0], label };
        }
      } else {
        const stateObj = this.hass.states[entityId];
        if (
          stateObj &&
          (stateObj.state === "playing" ||
            stateObj.state === "paused")
        ) {
          return { state: stateObj, label };
        }
      }
    }
    return null;
  }

  render() {
    const result = this._getActivePlayer();

    if (!result) {
      if (this.config.show_when_idle && this.config.idle_text) {
        return html`
          <ha-card>
            <div class="idle">
              <span class="idle-text">${this.config.idle_text}</span>
            </div>
          </ha-card>
        `;
      }
      return html``;
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
    const playerState = stateObj.state;
    const friendlyName = result.label || attrs.friendly_name || "";
    const height = this.config.card_height;
    const opacity = this.config.background_opacity;

    const artworkUrl = artwork
      ? artwork.startsWith("/")
        ? `${window.location.origin}${artwork}`
        : artwork
      : "";

    return html`
      <ha-card>
        <div
          class="container"
          style="height: ${height}px;"
        >
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
            <div class="metadata">
              <div class="title">${title}</div>
              ${artist
                ? html`<div class="artist">
                    ${artist}${album ? html` · ${album}` : ""}
                  </div>`
                : ""}
              <div class="info">
                <span class="source">${friendlyName}</span>
                ${app &&
                !stateObj.entity_id.startsWith("media_player.plex_")
                  ? html`<span class="separator">·</span
                      ><span class="app">${app}</span>`
                  : ""}
                ${rating
                  ? html`<span class="separator">·</span
                      ><span class="rating">${rating}</span>`
                  : ""}
                ${contentType
                  ? html`<span class="separator">·</span
                      ><span class="content-type"
                        >${contentType.charAt(0).toUpperCase() + contentType.slice(1)}</span
                      >`
                  : ""}
                <span class="separator">·</span>
                <span class="state"
                  >${playerState.charAt(0).toUpperCase() + playerState.slice(1)}</span
                >
              </div>
            </div>
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
          rgba(0, 0, 0, 0.9) 0%,
          rgba(0, 0, 0, 0.5) 40%,
          rgba(0, 0, 0, 0.1) 100%
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
      .title {
        font-size: 1.4em;
        font-weight: 700;
        color: white;
        text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
        line-height: 1.2;
        margin-bottom: 2px;
      }
      .artist {
        font-size: 0.95em;
        color: rgba(255, 255, 255, 0.85);
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
        margin-bottom: 4px;
      }
      .info {
        font-size: 0.8em;
        color: rgba(255, 255, 255, 0.55);
        margin-top: 4px;
      }
      .separator {
        margin: 0 4px;
      }
      .rating {
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 3px;
        padding: 0 4px;
        font-size: 0.9em;
      }
      .idle {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        color: var(--secondary-text-color);
        font-size: 0.9em;
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
