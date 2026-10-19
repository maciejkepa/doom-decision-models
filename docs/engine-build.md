# Rebuild the browser engine without containers

Players need only Node 24 and the committed artifacts. `npm ci` does not invoke a C compiler.

The tested compiler is **Emscripten 4.0.10**. Install and activate that version using the [official emsdk instructions](https://emscripten.org/docs/getting_started/downloads.html), then run:

```sh
npm run build:engine
npm run package:engine-source
npm run verify:assets
```

On macOS/Linux run `source /path/to/emsdk/emsdk_env.sh` first. On Windows run `emsdk_env.bat` in the shell used for building, or set `EMSDK` to the SDK directory and `EMSDK_PYTHON` to its bundled Python executable. The build script invokes emcc.py on Windows without relying on Unix make or shell syntax. Python is an SDK build tool, not an application backend or player requirement.

For Windows ARM, the tested route uses emsdk's x64 tools under Windows emulation. Set `EMSDK_ARCH=x86_64` while installing/activating SDK 4.0.10. The SDK's native ARM detection otherwise does not offer that release's Windows toolchain.

The first compilation downloads pinned SDL 2.32.0 and SDL_mixer 2.8.0 ports and verifies their SDK checksums. Later builds reuse the SDK cache. The original old upstream Emscripten makefile is used only as a source inventory: its shell flags and WAD preloading are replaced by the project build recipe.

Build outputs: `public/engine/doom.js`, `doom.wasm`, `manifest.json`. The build normalizes generated JavaScript to LF before calculating SHA-256. `.gitattributes` also forces LF for that file and disables text conversion for WASM, ZIP and WAD artifacts, keeping manifest hashes valid across Windows and Unix checkouts. `verify:assets` compares exact file bytes. Every release must publish the corresponding `engine/` sources, `scripts/build-engine.mjs`, upstream license and third-party notices together with the binaries. The source revision and compiler version are recorded in the manifest. Rebuilding need not be byte-identical across absolute build paths.

Freedoom assets are from the official [0.13.0 release](https://github.com/freedoom/freedoom/releases/tag/v0.13.0). Only Phase 1 is distributed. Its original license and credits accompany the WAD. Original Doom IWADs must never be copied into the public build.
