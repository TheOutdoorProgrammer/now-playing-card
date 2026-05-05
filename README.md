# Now Playing Card

A Home Assistant Lovelace card that shows the highest-priority currently playing media player with artwork, title, and metadata.

Iterates through a prioritized list of media player entities and displays the first one that's actively playing or paused. Renders the cover art as a full-bleed background with media info overlaid.

## Installation

### HACS

1. Add this repository as a custom repository in HACS (Integration type: Dashboard)
2. Install "Now Playing Card"
3. Add the resource in your dashboard configuration

### Manual

1. Copy `now-playing-card.js` to your `/config/www/` directory
2. Add the resource to your Lovelace configuration:

```yaml
resources:
  - url: /local/now-playing-card.js
    type: module
```

## Configuration

```yaml
type: custom:now-playing-card
entities:
  - entity: media_player.playstation_5
    label: PlayStation 5
  - match_app: media_player.plex_*
    label: Plex
  - entity: media_player.living_room
    label: Living Room
  - entity: media_player.joey_kays_room
    label: Bedroom
  - entity: media_player.boys_room
    label: Boys Room
  - entity: media_player.twins_tv_television
    label: Twins Room
  - entity: media_player.kitchen_video
    label: Kitchen
  - entity: media_player.office_echo
    label: Office
  - entity: media_player.bathroom_echo_2
    label: Bathroom
  - entity: media_player.boys_echo
    label: Boys Echo
  - entity: media_player.home_gym
    label: Gym
card_height: 300
background_opacity: 0.5
show_when_idle: false
idle_text: ""
```

### Entity format

Each entry in `entities` can be:

- A **string** — a `media_player` entity ID
- An **object** with:
  - `entity` — the entity ID
  - `label` — friendly name to show on the card (overrides the entity's `friendly_name`)
  - `match_app` — wildcard pattern to match dynamic entities (e.g., `media_player.plex_*` catches all Plex session entities)

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `entities` | list | **required** | Ordered list of media players (first match wins) |
| `card_height` | number | `300` | Card height in pixels |
| `background_opacity` | number | `0.5` | Darkness of the overlay on artwork (0 = no darkening, 1 = fully dark) |
| `show_when_idle` | boolean | `false` | Show the card when nothing is playing |
| `idle_text` | string | `""` | Text to display when idle (requires `show_when_idle: true`) |

## How it works

The card iterates through your entity list top-to-bottom. The first entity in a `playing` or `paused` state wins. Its artwork becomes the card background, and its metadata (title, artist, album, content rating, app name) is overlaid at the bottom with a gradient for readability.

The `match_app` option supports wildcard patterns for integrations like Plex that create dynamic entities per client session (e.g., `media_player.plex_chrome_osx_12345`).

When nothing is playing, the card renders nothing (empty) unless `show_when_idle` is enabled.

## License

MIT
