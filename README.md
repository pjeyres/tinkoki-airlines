# Tinkoki Airlines 🐾

Fly anywhere on Earth from the home airfield LWS (Lewes, East Sussex). Choose your pilot on the boarding pass or in Settings:

- **Loki**, a golden retriever in aviator goggles and a red scarf. He barks and fetches tennis balls.
- **Tinker**, a tabby cat in a purple cape with a bell collar. She meows and flies free, with no balls to chase.

## Run it

```bash
python3 serve.py
```

Then open http://localhost:8642. It runs in the browser and needs no install or build step. Cesium and three.js load from a CDN.

It's live at https://pjeyres.github.io/tinkoki-airlines/ (GitHub Pages republishes each push to `main`).

## Map styles

| Style | Needs | What you get |
| --- | --- | --- |
| Esri satellite + terrain | nothing (default) | Worldwide satellite imagery and real elevation (mountains, canyons) |
| Google Photorealistic 3D Tiles | Cesium ion token | Photoreal 3D cities, bridges and landscapes everywhere |
| Cesium World Terrain + OSM Buildings | Cesium ion token | Terrain, Bing aerial imagery and grey 3D buildings |

To get photorealistic 3D, create a free account at [ion.cesium.com](https://ion.cesium.com/tokens) and copy your default token. In the game, open Settings (⚙︎), paste the token, choose "Google Photorealistic 3D Tiles" and click Save. The token is stored only in your browser's localStorage.

## Controls

| Key | Action |
| --- | --- |
| W / ↑ · S / ↓ | Nose down · nose up (Settings has an arcade option that flips these) |
| A D / ← → | Bank to turn |
| Q E | Yaw |
| R or Shift · F or X | Throttle up · down |
| Space | Zoomies boost (recharges) |
| B | Bark (Loki) or meow (Tinker) |
| C | Camera: chase, locked chase, Loki's eyes, fly-by |
| Mouse drag / wheel | Look around / zoom |
| G | Giant mode |
| T | Search for any place |
| P · M · H | Pause · mute · help |

As Loki, fly through 🎾 tennis balls to fetch them. The yellow dot on the compass points to the nearest one. To land, fly gently into the ground; Loki then gallops wherever you steer. Hold nose-up with some speed to take off again. A hard dive into the ground (or a building in 3D modes) is a harmless bonk.

Gamepads work too: left stick to fly, triggers for throttle, X for zoomies, A to bark.

### On a phone or tablet

On-screen controls appear on touch screens. It plays best held sideways.

| Control | Action |
| --- | --- |
| Left stick | Pull back to climb, push to dive, sideways to bank |
| Thr slider | Slide up to go faster |
| ⚡ (hold) | Zoomies |
| 🐕 / 🐈 | Bark or meow |
| 🎥 · XL | Camera · giant mode |
| Drag · pinch | Look around · zoom |

Settings ⚙︎ has **Tilt to steer**, which steers by tilting the phone like a steering wheel, with ⟲ to recentre. Add the site to your home screen (Share → Add to Home Screen on iPhone) to fly full screen.

## Files

- `js/loki.js` and `js/tinker.js` build the pilots from simple shapes with three.js (helpers in `js/shapes.js`)
- `js/pets.js` holds each pilot's settings: size, camera, voice, animation and whether balls appear
- `js/flight.js` contains the arcade flight model (works on a round Earth and allows loops and rolls)
- `js/main.js` sets up the Cesium globe, camera, ground collision, tennis balls and UI
- `js/touch.js` handles the on-screen stick, throttle, buttons and tilt steering
- `js/hud.js` draws the attitude indicator, compass and readouts
- `js/audio.js` plays Loki's bark from the recording in `sounds/`, and synthesises the wind and Tinker's meow
- `js/places.js` holds the destinations list and place search
- `manifest.webmanifest` and `icons/` let phones install it as a full-screen home-screen app

## Why CesiumJS instead of Cesium for Unreal

Both stream the same Cesium and Google 3D Tiles of the whole planet. The browser version runs instantly on any computer and is easy to share and change. Unreal can look more cinematic (real-time shadows, volumetric clouds, fur shaders), but it needs the Cesium for Unreal plugin from Fab, a rigged dog model, and a large engine install. UE 5.8 is already installed on this Mac, so the Unreal route is open later. The flight model in `js/flight.js` ports directly to an Unreal Pawn.

## Credits

Loki's bark uses [Barking of a dog](https://commons.wikimedia.org/wiki/File:Barking_of_a_dog.ogg) by Amada44 from Wikimedia Commons, licensed [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). It was converted to AAC (`sounds/bark-1.m4a`), cut into single barks and pitched down. That adapted sound file is shared under the same licence.
