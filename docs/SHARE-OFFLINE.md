# Share cards and saved places

`js/trip-tools.js` mounts small Share and Save actions inside the collapsed daily plan and the existing place page. Saved places appear in a collapsed section below the dashboard. These tools do not add another floating button or top-level navigation destination.

## Sharing

The browser draws a 1080×1350 PNG after its Georgian fonts are ready. Text wraps within fixed bounds. All artwork is drawn locally with Canvas, so remote image servers cannot taint the export. A supported native file share sheet opens from the explicit Share button; other browsers start a PNG download. Cancelling the share sheet does not report success or start a second download. Text copying is a separate action with a selectable-text fallback.

The card includes the place, selected species when known, temperature, wind, an explicitly labelled conditions index, observation time and a short legal reminder. The index is not a catch probability. Old, unknown, future or saved observations never receive a live index; weather values without a valid observation time are omitted. Stored observations are labelled as saved weather with their timestamp.

Sources are `FishHuntDayPlan.current()` and `FishHuntPlaceContext.current()`. Both publish bubbling document events (`fishhunt:day-plan` and `fishhunt:place-context`). A canonical `WATERS` entry remains usable when live weather is unavailable.

## Offline use

Saving is explicit. At most 24 canonical place snapshots are stored in `fishhunt_offline_places_v1`, with a 180KB serialized-size limit. Saving a place again updates its snapshot. Quota failures report an error and do not claim success. Removing all snapshots clears only this key; account storage remains untouched.

Snapshots contain place information, species, the saved legal reminder and the time of any retained weather observation. Stored indices are removed. The offline library includes static safety guidance and emergency number 112. Maps, new forecasts and current legal verification still need connectivity. Saved information is not a permit.

The existing `push-sw.js` also prepares a small offline shell. Its four-file public allowlist is:

- `offline.html`
- `css/trip-tools.css`
- `js/trip-tools.js`
- `assets/icons/fishhunt-mark.svg`

These files use the cache namespace `fishhunt-offline-20261023b-v1`. Each body is bounded to 1.2MB. Bump this namespace when changing a cached shell asset. Offline preparation is best effort during worker installation, so an unavailable shell asset cannot disable Push. The explicit Save action requires a successful preparation acknowledgement before saying offline use is ready.

Offline home, dashboard and place-page navigations fall back to `offline.html`, where the current browser's saved snapshots remain available. Auth pages, admin pages, **all API routes**, weather responses, remote images and map tiles are neither cached nor used as offline fallbacks. Existing Push subscriptions and notification click handling are retained. Cache cleanup affects only superseded `fishhunt-offline-` caches, once the current shell is prepared.

`tests/trip-tools.test.cjs` verifies observation freshness, saved-index removal, storage limits/failures, text wrapping, share cancellation, font readiness, offline navigation, cache boundaries and preparation failures. Existing foreground-notification tests cover preserved notification click behavior.
