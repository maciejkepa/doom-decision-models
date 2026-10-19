# Third-party notices

Project-authored source is licensed under GPL-2.0-or-later. See LICENSE. Third-party components keep their original licenses.

* **doomgeneric / Doom / Chocolate Doom**: upstream https://github.com/ozkl/doomgeneric, revision `e257a09527062bfb986b6e5e0780839b6cbd5b71`. Copyright notices remain in the vendored sources. GPL-2.0-or-later; some upstream files carry their own notices. Project modifications are applied by `scripts/build-engine.mjs`; original bridge and browser host are in `engine/`. `public/engine/source.zip` supplies corresponding project engine source with distributed WASM.
* **Freedoom Phase 1 0.13.0**: https://github.com/freedoom/freedoom/releases/tag/v0.13.0. BSD-style license and original credits are in `public/assets/FREEDOOM-LICENSE.txt` and `FREEDOOM-CREDITS.txt`. These are replacement game data, not original Doom E1M1. Original commercial/shareware IWADs are not bundled or uploaded.
* **SDL 2.32.0 and SDL_mixer 2.8.0**: official Emscripten ports. Zlib licenses in `public/licenses/SDL.txt` and `SDL_mixer.txt`. No music instrument bank is bundled.
* **Emscripten 4.0.10**: https://github.com/emscripten-core/emscripten; MIT/University of Illinois/NCSA licenses and third-party runtime notices in `public/licenses/EMSCRIPTEN.txt`. Rebuild through the official SDK.
* **React, Vite, TypeScript, Zod, Azure Identity and Microsoft Rayfin SDKs**: licenses remain in installed npm packages. Locked versions and source links are recorded by npm metadata. No vendor credentials or proprietary game assets are included.

Related work: [Jev Doom agent](https://github.com/lukaske/jev-doom-agent) is acknowledged as an existing example of model-driven Doom. Its source, prompts, UI, modified engine and binaries were not used in this implementation.
