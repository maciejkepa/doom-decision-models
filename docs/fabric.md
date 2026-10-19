# Fabric Apps deployment

Status: the SDK transport, generated function types/metadata and builds are implemented. No workspace deployment has been performed. Remote authorization, cold starts, latency, MIME types and hosting prefixes remain deployment acceptance checks.

1. Use a Fabric workspace with capacity and Fabric Apps/Functions availability. The publisher must own the functions item. Use Node 24 and `npm ci`; the CLI and SDKs are pinned to 1.36.2.
2. Set `endpoint`, `deployment` and authentication in `rayfin/functions/src/settings.ts`. These settings are server-only. Default is `entra`, which reads `ctx.Tokens.AzureAI`. Give the deployed application's identity permission to invoke the Foundry resource. The current documented identity is the Fabric item owner, not a managed identity and not each app viewer.
3. Run `npx rayfin login`, then `npm run build:fabric` and inspect `dist-fabric` and the functions bundle.
4. Set `FABRIC_WORKSPACE` to the workspace name and run `npm run deploy:fabric`. This performs a full Rayfin deployment, applying auth and static hosting settings. New remote identifiers are created; none are borrowed from the previous Doom repository.
5. Open the App URL and sign in. Choose **Sign in to Fabric** in the app if needed, launch E1M1, and start AI. The frontend resolves deploy-time `rayfin.config.json` relative to its own URL.

PowerShell:

```powershell
$env:FABRIC_WORKSPACE = 'Your workspace'
npm run deploy:fabric
```

macOS/Linux:

```sh
FABRIC_WORKSPACE='Your workspace' npm run deploy:fabric
```

For API-key authentication set `auth: 'key'` in the server settings and configure the secret interactively after creating the deployed app:

```sh
npx rayfin secret set FOUNDRY_API_KEY
```

Never put its value in command history, source files or VITE variables. The default function declares AzureAI; when deploying exclusively with an API key, remove that audience from the RayfinContext annotation to avoid requiring an unused platform connection. Rebuild and redeploy so the CLI regenerates metadata.

## Local frontend against Fabric

Create `.env.fabric.local` with the deployed public `VITE_RAYFIN_API_URL`, `VITE_RAYFIN_PUBLISHABLE_KEY`, `VITE_FABRIC_WORKSPACE_ID` and `VITE_FABRIC_ITEM_ID`, then run `npm run dev:fabric`. Add the local origin to allowed redirect URIs when deploying. This starts Vite only and never a local Rayfin/Docker stack.

## Package and acceptance checks

Functions register the source handler with an explicit RayfinContext annotation. The pinned CLI generates `src/types.ts` and `runtimemetadata.json`. The server bundle includes decision-core, shared schemas and Zod, leaving only the Fabric runtime external. It does not reference source files outside its package at runtime. Run `npm ci --prefix rayfin/functions` before standalone deployment to install its locked runtime dependencies.

Keep compressed static ZIP under 100 MB and Functions ZIP under 30 MB. `npm run verify:packages` builds inspection archives and verifies sizes. Source archives, WAD and WASM belong to static hosting only, never the Functions package.

After deployment record: unauthenticated invocation denied, authenticated call succeeds, WASM has the right MIME, audio starts after click, relative asset URLs work under the hosting prefix, and a several-minute session produces fresh applied decisions. Compare first/cold invocation with subsequent p50/p95. Do not call the Fabric path verified based on a successful local Foundry test.

Restrict access to intended viewers and configure Foundry quota. The 15-minute browser session cap and per-function-instance controls are not a global cost cap. Each viewer runs a separate game and consumes inference independently.

References: [Functions](https://learn.microsoft.com/en-us/fabric/apps/functions), [external connections](https://learn.microsoft.com/en-us/fabric/apps/functions-connect-external-resources), [hosting](https://learn.microsoft.com/en-us/fabric/apps/hosting), [secrets](https://learn.microsoft.com/en-us/fabric/apps/manage-function-secrets).
