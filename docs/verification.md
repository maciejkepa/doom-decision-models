# Verification record

## Colored locks and key search: tactics-9

The native input guard previously rejected use without a key while the sensor exposed the requirement only after a failed use. AI could therefore face a closed door indefinitely without receiving the missing-color fact. Bridge **9** classifies requirements only for visible, non-secret, usable surfaces. Prompt/catalog **tactics-9** names inventory colors, treats both card and skull as valid, identifies visible key sprites and offers `face_key_ID`. Optional schema-4 memory fields retain up to 16 observed locks and 12 observed key clues. No unobserved key location or automatic route is supplied.

Final real Foundry calibration matched **7/7** stated cases, covering all three missing colors before any use, facing a visible needed key, holding translation before an off-axis key turn, approaching an aligned key, turning toward a remembered right-side key and using a lock with a matching skull. Earlier calibration found the remembered-right case incorrectly scanning left and allowed forward movement before an off-axis key turn. Named sides and explicit alignment criteria corrected those measured failures. These are prompt-tuning examples with specified expected channels, not held-out gameplay accuracy. Evidence is ignored `artifacts/keys-evaluation-tactics-9.json`.

The end-to-end paid diagnostic used full Freedoom E1M1 geometry with other things disabled, a blue lock 40 units ahead and a blue card deliberately placed 80 units behind the test spawn. Actual Decision-1 chose retreat, collected the card at **1,062 ms**, returned, used the door, waited and crossed at approximately **5,927 ms**. Opening was observed at 4,127 ms and passability at 4,912 ms. There were **32 requests, 27 applied, 5 rejected and zero errors**, with answered-request latency **211/383 ms p50/p95**. The card was initially unseen and was collected during retreat. This validates leaving the lock, inventory updates, use and passage in a controlled encounter. It does not establish discovery of a distant key or navigation from the normal map start. Evidence is ignored `artifacts/live-keys.{json,png}`. Repeat with `npm run smoke:keys` against a running local app.

Focused browser verification passed **26 distinct Chromium/Firefox cases** across targeted runs: 12 existing interaction cases and 14 key cases. The key cases exercise native point-facing, real pickups, matching card/skull acceptance, rejection of another color, pre-use key recognition and secret/out-of-FOV filtering. **57 unit tests passed**, including color mappings, bounded memory, changed bearings, acquisition, map/episode resets and prompt facts. WASM and corresponding source were rebuilt together and their hashes verified. Local and Fabric builds and strict TypeScript checks passed. Inspection ZIPs were **13.68 MiB static / 7.53 MiB Functions**, within the 100/30 MiB limits. Remote Fabric deployment remains unverified.

## Motion-compensated aiming and responsive doors: tactics-8

Current prompt/catalog **tactics-8**, engine **bridge-8**, schema **4** with optional snapshot-point fields. The model chooses each target. Enemy/surface choices preserve a world point reconstructed from that observation, while the native executor compensates only the player's observed translation. It never reads a live enemy position to update the point. Scans retain their previous absolute-heading semantics. Point renewal preserves own-motion compensation, stationary bearings retain the original braking profile, and AI strafe input is 12 instead of 24. Forward/retreat/manual input is otherwise unchanged.

A mechanical comparison uses full-map geometry with other things disabled and a synthetic stationary aiming marker at 192 units. Both variants use the same new strafe speed and begin aligned. A delayed view response is injected during translation. This isolates the difference between a frozen heading and compensation to a fixed point, rather than attributing the result to slower movement. The p95 angular errors over 13 sampled completed tics per compensated case were:

| Browser / strafe | Frozen heading | Snapshot-point compensation |
| --- | --- | --- |
| Chromium / left | 19.670 degrees | 0.169 degrees |
| Chromium / right | 19.027 degrees | 0.140 degrees |
| Firefox / left | 18.313 degrees | 0.133 degrees |
| Firefox / right | 19.027 degrees | 0.132 degrees |

The tests also verify displacement, continued firing, an unchanged selected point and input expiry. They deliberately isolate native execution from controller source TTL, which has separate tests. Evidence: ignored `artifacts/aiming-{left,right}-{chromium,firefox}.json`. These are geometric aiming measurements against a stationary marker, not a measured hit rate against moving enemies.

Door waiting now polls the same observed door at 35 ms intervals, ends when passable and reserves the first eligible movement request without exceeding the existing rate limit. A late wait for an already passable door is rejected without invalidating pending movement. Source/current-state use validation omits opening/open/closing doors and activated switches from the action choices. A live diagnostic exposed repeated use toggling the door and cancelling movement, which this validation prevents. An active aligned point lease no longer blocks actual use merely because its lease remains active.

The final real Decision-1 door diagnostic applied **use at tic 45, wait at 57, advance at 81 and 100**. It observed opening at 595 ms, passability at 1,385 ms, confirmed movement about **216 ms** after the first passability observation and crossed in **2,299 ms**. A preceding run without reserving the movement slot measured 634 ms from observed passability to movement, showing that merely changing the round-robin cursor still allowed view/action to consume the next slot. These are individual warm-service runs, not a latency distribution. The metric uses 50 ms sensor polling and the trace's application acknowledgement, so it is approximate. Evidence: ignored `artifacts/live-interactions.json` and `.png`.

The final real-model interaction calibration matched **8/8** synthetic cases, including a newly activated yet already passable door. A centered `face_surface` point is accepted alongside hold because it produces no rotation and permits use/wait. The passable case still requires advance plus action hold, and cannot pass by closing the door again. These are tuning cases with explicitly listed expected channels, not held-out accuracy. Evidence: `artifacts/interaction-evaluation-tactics-8.json`.

Validation: **51 Vitest tests passed**. Browser verification covers **46 distinct Chromium/Firefox cases** across a full run and focused reruns. The first full run passed 43/46. A native-only comparison was separated from incidental source-TTL stalls, stationary point aiming recovered its original braking profile, and a legacy seven-tic composite diagnostic passed on isolation after one host-load truncation by its existing 300 ms input cap. All **20 focused native checks** then passed, followed by **8 final interaction/heading checks** after the use guard. The door passage test now observes actual crossing within a bounded window instead of assuming it happens at exactly 800 ms. Correlation, stale-point tampering, early wake, wrong-door identity, rate-slot reservation, death/episode changes and release of active point traces on interaction epochs are covered.

A final normal-start **30-second** full-map trial used genuine Decision-1 calls: **169 requests, 159 applied, 10 rejected, zero errors**, latency **209/259 ms p50/p95**. The player was alive with **71 HP** when stopped, and the map was not completed. Twenty observed snapshots with point aiming and lateral input had **0.328 degrees median / 14.688 degrees p95 / 23.190 degrees maximum** angular error, including acquisition, close-range saturation and target changes. The controlled marker improvement therefore does not mean every live aim correction or shot is accurate. Moving targets still require model updates. Performance samples were 58-60 FPS / about 35 TPS, with no recorded lease expirations. Evidence: ignored `artifacts/live-tactics-8-final.{json,png}` and `-report.json`. A later unit-tested diagnostic cleanup marks aligned point traces released when an interaction advances the epoch. It changes trace termination reporting, not those gameplay decisions.

Final local/Fabric production builds, TypeScript checks, WASM/data/source hashes and package inspection passed. The refreshed inspection ZIPs are **13.68 MiB static / 7.52 MiB Functions**, within the 100/30 MiB limits. Remote Fabric deployment remains unverified.

## Wall clearance and evasive combat: tactics-7 (19 October 2026)

Current prompt/catalog **tactics-7**, native **bridge-7**, observation schema **4**. New optional `bodyDistance`, `progress` and `blockedTics` fields preserve older fixture readability. Native termination adds `blocked`.

The model receives player-box clearance instead of treating a center ray as a body-sized passage. The engine reports late collisions throughout an input lease, so the first four-tic history sample no longer hides a later wall contact. Three consecutive almost-stationary tics after acceleration terminate only that movement; reversal inertia and wall sliding are excluded. No replacement move is supplied locally. Forward AI input is 14 versus the former 25; retreat/strafe and manual walking are unchanged. The prompt favors lateral movement or retreat with sustained fire, searching after actual failure/unseen damage, and finishing a selected heading through the model-selectable `continue_turn` option.

The final paid calibration matched **9/9** synthetic situations, checking only each example's stated expected channels: distant/close/multiple ranged threats, center-ray versus body blockage, a remembered unseen attacker, clear exploration, finishing a search turn, a tight traversable corridor and an off-axis door beyond use range. These are prompt-tuning cases, not held-out accuracy. An intermediate real gameplay run exposed prolonged idling at 113 units of body clearance; the final criteria distinguish **tight** from **blocked**, allow cautious approach above 24 units and favor aligning an off-axis closed surface. Evidence: ignored `artifacts/navigation-evaluation-tactics-7.json`.

Rendering diagnostics now distinguish p95 simulation work and latest snapshot cost from rendering and frame intervals. An isolated full-map run measured roughly 35 TPS, 0.4-1.5 ms snapshot costs and 46-60 FPS on this host. This does not establish the full UI's frame rate. Probability bars now animate scale transforms instead of widths, avoiding layout animation while preserving rows and retained scores.

Validation: **40 Vitest tests** passed. A full **38-case** Chromium/Firefox run passed, followed by **8 focused final checks** for collision, unchanged manual speed, inertia reversal and persistent probability rows; this covers **40 distinct browser cases**. Local and Fabric production builds and TypeScript checks passed. WASM/data/source hashes were verified. Inspection ZIPs are **13.68 MiB static / 7.52 MiB Functions**, within their 100/30 MiB limits; remote Fabric deployment remains unverified. The green/gray-pixel regression remains passing, with at most 124 green background pixels rather than the old 135,360-pixel corruption.

A real door diagnostic initially exposed a race: a movement request captured before `use` could resume translation after activation and make a valid `wait` fail its stationary-input check. Accepted use now invalidates earlier requests through the shared epoch and immediately obtains fresh observations. It does not insert an automatic wait. The final paid diagnostic applied **use at tic 69, wait at 89, advance at 129 and 148**, opened the door, observed passability and crossed it in **3,810 ms**. Evidence: ignored `artifacts/live-interactions.json` and `.png`. This is the documented diagnostic spawn in full geometry, not discovery from the normal start.

The final **60-second** normal-start Freedoom E1M1 / Hurt Me Plenty trial retained TTL 500 ms and timeout 1200 ms:

| Measurement | Result |
| --- | --- |
| Requests / applied / rejected / errors | 307 / 278 / 29 / 0 |
| HTTP latency p50 / p95 | 279 / 487 ms |
| Applied movement with visible enemies in its source observation | 44; strafe/retreat only, zero advances |
| All applied translation choices | 41 strafes, 6 retreats, 23 cautious advances, 19 holds |
| Snapshots with evasion and firing simultaneously active | 110 (not distinct shots) |
| Native movements terminated as blocked | 8 |
| Advance selected after observing native blocked state | 0 |
| View updates without a visible enemy | 27, including surface alignment |
| Actual use / wait | 2 / 1 |
| Maximum observed time without travel | 86 tics, about 2.46 simulation seconds |
| Observed visited cells | 16 |
| Browser errors | 0 |
| Outcome | Alive when stopped, 44 HP, ammunition exhausted; level not completed |

Twenty rejection records concerned freshness; five were cancelled around lifecycle changes and four were rejected at the native boundary. Rejections retain their actual reason in the trace. The model selected all choices; there was no scripted escape, route, target tracker or tactical override. Evidence: ignored `artifacts/live-tactics-7-accepted.{json,png}` and `-report.json`.

Full UI performance samples were **25-37 FPS and 28-35 TPS**; final counters were 34 FPS / 35 TPS, p95 frame interval 65 ms, p95 render work 6.6 ms, p95 simulation work 1.3 ms and latest snapshot cost 0.2 ms. This host did **not** demonstrate stable 60 FPS. The live script now exports before taking a screenshot to avoid contaminating performance counters with screenshot work. The first intermediate run had lower simulation throughput, so its survival time is not a controlled comparison. These are individual model sessions, not a survival-rate estimate; the improved tactical choices do not prove reliable level completion or solve ammunition management.

## Rendering correction: bridge-6.1

Walking with camera interpolation could project the view actor's own world sprite in front of the camera. Its enlarged green/gray uniform appeared as blocks covering the scene. The renderer now excludes only the view actor from world sprite projection; first-person weapons and all other sprites keep their normal rendering paths. Interpolation and the 60 FPS renderer remain enabled.

A pixel regression uses the full E1M1 geometry with a neutral door-facing spawn and other things disabled. It samples displayed frames while walking, reversing and turning, including frames between simulation tics. The old WASM failed with **135,360 green pixels out of 153,600** in the sampled scene region. The corrected WASM passed in **Chromium and Firefox**, with at most **60** green background-detail pixels in the final full-suite run. Reports are in ignored `artifacts/rendering-chromium.json` and `artifacts/rendering-firefox.json`. This check uses no Foundry calls. WASM, manifest hashes and corresponding source archive were regenerated; local/Fabric builds, type checking, hashes and package limits passed.

The heading regression retains all angular accuracy and lifecycle checks. It now records FPS/TPS as a test attachment rather than requiring an arbitrary 45 FPS minimum on the test host; that unrelated benchmark floor failed under load at approximately 43 FPS even though every heading assertion passed. Frame-rate performance remains measured separately from pixel correctness.

All **34 functional browser cases** were verified: 32 passed in the full run and the two heading cases passed on rerun after separating that benchmark floor from functional assertions.

## Asynchronous channels release: bridge-6 (19 October 2026)

Schema **4**, catalog/prompt **async-6**, engine **bridge-6**. Movement, view and action use separate asynchronous HTTP calls, with partial native updates, independent leases and per-channel acknowledgement. Explicit target options select a snapshot heading; the executor never tracks a moving enemy or selects a target itself.

Validation: **36 Vitest tests**, **32 Playwright cases across Chromium and Firefox**, local production build, Fabric build and asset/source hash checks passed. Mechanical browser tests cover north wraparound, <=0.5-degree precision, completed/passed delayed turns, independent input replacement/release/expiry, stable snapshot IDs, real suspension and use/wait/pass with native interaction checks. Existing full-map visibility, combat-input, pickup/death/exit and UI probability persistence checks remain passing. A final memory test prevents a second lane from treating the first few acceleration tics as a blocked movement attempt.

Two **30-second observation windows** used normal full Freedoom E1M1, Hurt Me Plenty, Chromium 156, TTL 500 ms and timeout 1200 ms:

| Measurement | Previous batched version | Separate asynchronous requests |
| --- | --- | --- |
| HTTP requests | 47 | 71 |
| Applied records | 40 complete control frames | 67 single-channel updates |
| Rejected / errors | 5 / 2 | 4 / 0 |
| Latency p50 / p95 | 289 / 504 ms | 206 / 405 ms |
| TTL rejection records | 4 | 1 |
| Time from first request to death | 21.2 s | 13.1 s |
| Completed heading error | Not instrumented | Maximum 0.081 degrees over 5 completed turns |
| Measured rendering/simulation | Not instrumented; host capped at 35 FPS | Samples 55-60 FPS, about 35 TPS |
| Result | Death, no completion | Death, no completion |

**Survival did not improve in this comparison.** These are individual stochastic gameplay sessions, not a controlled accuracy evaluation. The new sustained input leases change how far a movement can continue between decisions. Lower measured HTTP latency and accurate camera execution do not establish better navigation, threat selection or survival.

The final new run selected precise enemy directions, a surface direction, retreat, use and wait. Two already-passed view directions were acknowledged without replaying the original relative turn. Completed heading error refers to the requested snapshot direction; it is not accuracy against a subsequently moving enemy. Interrupted turns are explicitly marked superseded/released and excluded from the precision statistic.

Final exported performance: 59.9 FPS, 34.9 TPS, p95 frame interval 20.7 ms and p95 render cost 2.1 ms. These final counters include the post-death observation window. There were no movement/view lease gaps, and one action lease expiry with approximately 350 ms of expired idle time. Gap measurements have simulation-tic resolution and exclude explicit hold/release. Probability panels remained populated throughout pending requests.

Reported token usage totaled 105,779 input / 132 output tokens in the old run and 120,590 input / 69 output tokens in the new run. The old requests contained three questions, the new requests one; active play durations differed. These are reported usage totals, not a price estimate or a general cost benchmark.

Evidence: ignored `artifacts/live-baseline-before-async-6.*`, `artifacts/live-async-6-final.*` and `artifacts/async-6-comparison.json`. Recompute the comparison with `node scripts/compare-live.mjs`. Missing baseline camera/FPS fields remain null. A preceding 60-second observation window also demonstrated real separate requests (83 applied, p50/p95 211/267 ms) and ended in death; it preceded the final movement-memory sampling fix. Genuine single-question replies, including an explicit enemy direction, are retained in `tests/fixtures/foundry-async-live.json` for offline parser tests.

A separate paid door diagnostic used full E1M1 geometry with a changed spawn and other things disabled. Decision-1 chose use, wait and advance; the door opened, became passable and was crossed in **2,281 ms**. This verifies interaction execution, not discovery from the normal start. Fabric remains build-verified only; no remote deployment was performed.

The sections below describe earlier releases and their historical measurements.

Live measurements: **18 October 2026**; interaction release verification completed **19 October 2026**, Europe/Warsaw. This records tests actually run, not a guarantee of level completion.

## Local Foundry and game

An existing deployment named `Decision-1` in a Sweden Central Foundry resource returned HTTP 200 with model `microsoft-decision-1`. The live response includes `answers.action.choice`, `confidence`, `probabilities` and token usage. A redacted connectivity response is committed as `tests/fixtures/foundry-live.json`; fixtures are used only in tests.

The first full-map attempt applied no actions because Azure CLI credential acquisition was repeated on each request. Measured credential acquisition was 1630 ms. Server-side token caching and refresh-before-expiry fixed that issue; default TTL/timeout were retained. Five direct full-observation calls measured 729, 332, 180, 178 and 168 ms. The sampled request used 694 input tokens.

The original `explore-1` baseline **60-second Chromium session on full Freedoom E1M1**, Hurt Me Plenty, with TTL 500 ms and timeout 1200 ms:

| Measurement | Result |
| --- | --- |
| Decisions recorded | 94 |
| Applied actions | 93 |
| Rejected responses | 1 |
| API/controller errors | 0 |
| Response latency p50 | 193 ms |
| Response latency p95 | 226 ms |
| Executed actions | advance, fire, advance_fire, retreat, strafe_left_fire |
| Browser JavaScript errors | 0 |
| Outcome | Player death; level not completed |

The model advanced across the level, fought and collected ammunition. It died around tic 1124; the browser remained open to finish the observation window. The last pre-action observation had 5 HP; the screenshot showed 0 HP and `DEAD`. Local traces/screenshots are in ignored `artifacts/`. The run validates integration, not navigation skill or guaranteed completion. It does not test original DOOM1.WAD.

## Combat and turning correction

The baseline trace revealed a behavioral problem despite valid integration: a visible enemy at roughly 557 units was ignored until the player had lost health, and the model repeatedly walked into blocking geometry. The original criteria mostly described key presses. The revised prompt `combat-explore-2` adds tactical criteria and a factual sensor summary; catalog `actions-2` and native `bridge-2` add fine 3.5-degree and large 45-degree turns alongside existing 14-degree turns. No model decision is replaced by a controller or route.

`npm run evaluate:decisions` compares both prompts using real inference on seven synthetic observations. The final calibration passed 7/7 for the new prompt versus 1/7 for the baseline: centered distant enemy, enemies left/right, fine aim, blocked corridor with left/right openings, clear corridor. These examples were used during prompt tuning, so this is a calibration check, not held-out accuracy or proof of gameplay competence. The baseline cannot choose the new fine-aim action. The first draft passed only 4/7; explicit passage labels and angular-error descriptions improved the final result. This follows Microsoft's [guidance on task-specific state and criteria evaluation](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-microsoft-decision#best-practices).

A subsequent real 60-second Chromium game used the same E1M1, skill and controller timing parameters:

| Measurement | Baseline | Corrected prompt/catalog |
| --- | --- | --- |
| Applied decisions | 93 | 178 |
| Rejected / errors | 1 / 0 | 0 / 0 |
| Latency p50 / p95 | 193 / 226 ms | 197 / 243 ms |
| First observed enemy tic | 170 | 157 |
| First applied firing action tic | 260 | 177 |
| Enemy observation to firing input (35 Hz) | 2.57 s | 0.57 s |
| Health in first firing observation | 87 | 100 |
| Camera turns / aim corrections | 0 | 70 |
| Outcome | Death | Stopped after one minute, 104 HP |

The corrected run first chose `aim_left` for an enemy at +8.34 degrees, then `fire` at +4.66 degrees. It executed 100 advances, 65 normal left turns, 4 large right turns, 1 fine left aim and 8 firing actions. No browser errors occurred. The run survived but navigation still revisited areas and turned repeatedly; it did not finish the level. These are individual asynchronous gameplay runs, not a controlled survival-rate estimate. Local evidence is `artifacts/tactical-evaluation.json` and `artifacts/live-combat-explore-2.{json,png}`; the smoke report retains action counts and first-enemy/first-fire tics.

## Door, switch and wait correction

Release identifiers: observation schema **2**, prompt **interact-3**, catalog **actions-3**, engine bridge **bridge-3**. The interaction sensor now exposes bounded visible surfaces, exact use-ray reach, observed opening/closing, passage clearance and actual use feedback. It excludes walk-only triggers and secret-flagged surfaces. A key requirement is learned only after a failed use, then retained for that observed surface. The new `wait` action releases input and delays the next fresh observation by 600 ms without pausing the game.

The real Foundry calibration on eight synthetic interaction situations passed **8/8**: closed door/use, opening door/wait, passable door/advance, ready switch/use, freshly activated switch/wait, distant door/approach, off-axis surface/turn, and missing key/explore elsewhere. The first draft passed 6/8; explicit observed key information and waiting after switch activation addressed the two misses. These are tuning examples, not held-out accuracy.

`npm run smoke:interactions` then verified actual model control in the full E1M1 engine. This diagnostic changes the player spawn to face a real door and disables other spawned things; it preserves the map geometry. Decision-1 selected the following sequence without a scripted action policy:

| Model action | Applied tic |
| --- | --- |
| use | 42 |
| wait | 50 |
| advance | 81 |
| advance | 91 |

The sensor observed the door opening, becoming passable, and the player crossing it in **2167 ms**. Evidence is retained locally in `artifacts/live-interactions.json` and `.png`; calibration is in `artifacts/interaction-evaluation.json`. This proves the use/wait/pass integration for that encounter, not autonomous navigation from the original spawn or completion of the map. CI runs the mechanical tests without paid inference.

## Persistent probabilities and simultaneous combat inputs

Release identifiers: prompt **combat-interact-4**, catalog **actions-4**, bridge **bridge-4**; observation schema stays at 2. The sidebar retains the last scored response during pending requests, failures and responses without scores. Rows stay in catalog order and keep their DOM identity; widths transition to new values, with no clearing of the panel. Its source tic distinguishes retained scores from the latest proposal. The compact terminal theme is an original layout using restrained green accents and a dominant canvas.

The native bridge adds backward+fire, turn+fire and forward/backward+turn+fire actions. A browser test checks movement direction, actual rotation, ammunition use and expiration for ten combined actions, including all seven additions. These controls are held simultaneously in the ordinary game input path. The model still chooses a single catalog option.

Five real Foundry calls on synthetic evasive-combat examples matched the preferred action in **4/5** final calibration cases. It selected backward fire for a close centered threat, right strafe fire when only the right passage was clear, retreat/right-turn/fire for a close right target, and stationary fire for a distant target. For the close left target it chose left-turn/fire instead of the preferred backward/left-turn/fire. The first draft matched 2/5. This is a tuning check and illustrates that extra actions do not guarantee the safest choice.

A subsequent full 60-second observation window started from the normal Freedoom E1M1 spawn, Hurt Me Plenty, with the unchanged TTL 500 ms / timeout 1200 ms:

| Measurement | Result |
| --- | --- |
| Decisions / applied / rejected / errors | 75 / 59 / 16 / 0 |
| Response latency p50 / p95 | 238 / 948 ms |
| First observed enemy / firing tic | 213 / 223 |
| Health at first firing observation | 100 |
| New combined actions executed | advance+left-turn+fire: 3; right-turn+fire: 5; left-turn+fire: 3; retreat+left-turn+fire: 1; retreat+right-turn+fire: 1 |
| Other interaction actions | use: 1; wait: 2 |
| Browser errors | 0 |
| Outcome | Death; map not completed |

This run confirms execution of the new combinations in real model-controlled play and does **not** establish improved survival. The 16 rejected decisions exceeded freshness constraints; these constraints were retained rather than applying old observations. Evidence is `artifacts/live-combat-interact-4.{json,png}`, its `-report.json`, and `artifacts/combat-evaluation.json`. Earlier surviving runs and this losing run are individual trials with differing model decisions and service latency, not a controlled comparison.

## Independent movement, looking and action

Previous release: observation schema **3**, prompt **independent-5**, catalog **channels-5**, bridge **bridge-5**. Foundry answered three choice questions (`movement`, `view`, `action`) in one request against one observation. All three answers were validated atomically, but their native input durations expired independently. The action channel could keep firing after a short view correction ended. No autonomous navigator or aiming controller supplied a choice.

Wall feedback now uses displacement projected onto the requested movement direction: backward knockback no longer looks like successful forward motion. Two failed translations mark stuck. Memory retains eight observed heading counters per visited cell, rotation/time without travel, and up to four last-seen enemy bearings for five seconds. Remembered positions are derived only from earlier visible objects, not read through walls.

Real Foundry evaluations of the new channel conditions matched **3/3** wall/search cases and **5/5** combat cases. The final interaction calibration matched **7/8** conditions: a newly activated switch produced three holds rather than the requested explicit `wait` action. A passable-door case chose forward movement but also `use`; its expectation checks forward passage only, so that pass does not prove correct action selection for all channels. These are tuning examples with partial expected-channel checks, not held-out gameplay accuracy. Results are versioned under `artifacts/*-evaluation-independent-5.json`. `tests/fixtures/foundry-channels-live.json` contains a redacted real three-question response for offline parser tests.

The real-model door diagnostic passed with separate channel choices: hold/hold/use at tic 55, hold/hold/wait at 71, then advance/hold/hold at 102 and 114. The actual door opened, became passable, and was crossed in **2757 ms**. It uses the documented diagnostic spawn, not a route from the normal start.

A normal-start full E1M1 trial then ran for a 60-second observation window with the original TTL 500 ms and timeout 1200 ms:

| Measurement | Result |
| --- | --- |
| Decisions / applied / rejected / errors | 57 / 54 / 3 / 0 |
| Response latency p50 / p95 | 309 / 474 ms |
| First enemy / first firing tic | 209 / 219 |
| Health at first firing observation | 100 |
| Observations marked stuck | 16 |
| Executed advance while marked stuck | 0 |
| Search rotations without a visible enemy | 11 |
| View rotations total | 23 |
| Action choices fire / use / wait | 16 / 1 / 1 |
| Browser errors | 0 |
| Outcome | Death; level not completed |

These counts confirm searching and cessation of repeated forward pressure in this run, not general navigation competence or improved survival. Evidence is `artifacts/live-independent-5.json`, `.png`, and `-report.json`. The run still contains poor decisions and ends in death; earlier runs are not controlled comparisons. After this run, a unit-tested memory correction reset the failure count for a new movement intent or a heading change of at least 30 degrees, so an old wall does not keep translation inhibited after turning toward a new corridor; this final correction was not included in those live counts.

## Automated checks

* Contract/parser/scheduler/credential/prompt suite: **28 tests passed**, including real single/three-question API fixtures, atomic frame parsing, stale responses, correlation, timeout, single-flight, epoch invalidation, terminal outcomes, token refresh, waits, projected movement failures and stale enemy-memory expiration.
* Browser suite: full Freedoom E1M1 loads, manual fire consumes ammo, restart restores inventory, malformed IWAD is rejected. Passed in Chromium 156 and Firefox 157 (four initial scenarios).
* TypeScript checks, local production build and Fabric build succeeded.
* Production Node hosting on port 8787 passed a Chromium launch check: full E1M1 ready, no JavaScript errors, health configured and WASM served as `application/wasm`.
* Emscripten 4.0.10 produced the custom WASM on Windows; SDK x64 tools ran under Windows ARM emulation.

The browser bridge tests additionally passed in both engines: an independent parser of the full E1M1 geometry identifies objects hidden behind one-sided walls and verifies they are excluded; turning excludes objects outside FOV; expired commands and stale epochs are rejected; fire expires; suspension freezes tics and resume does not catch up. Tests verify view angles, door discovery/use/opening/passage, interaction-memory reset, walk-only/secret surface exclusion, key feedback, off-axis use and real exit activation. Legacy composite diagnostics verify displacement, rotation, ammunition and expiry. The independent-channel test verifies a one-tic view ends while movement/fire remain, then movement ends before fire, followed by full expiry; stale epochs and unowned equipment are rejected. The sidebar test preserves keyed rows and source tics during pending/unscored responses. All **26 browser scenarios passed** in Chromium and Firefox.

Static assets and source archive SHA-256 checks passed. Fabric inspection ZIPs are approximately **13.67 MiB static** and **7.52 MiB Functions**, within the 100/30 MiB limits. Both package builds succeeded; no remote Fabric deployment is claimed.

## Remaining external validation

* Fabric workspace/capacity, authenticated remote invocation, cold/warm latency, MIME types, audio and prefixed hosting URLs require an actual deployment.
* Original DOOM1.WAD was not supplied, so that data set has not been exercised.
* macOS/Linux runtime instructions are provided; local execution was tested on Windows. CI is configured for Ubuntu.
* Exact sprite visibility is not asserted: sensors deliberately use engine line-of-sight and FOV approximations.

The dependency audit has no high/critical findings after upgrading the test runner and ZIP library. Three moderate findings remain in the development-only Rayfin CLI → tedious → sprintf-js chain. The suggested automatic downgrade would remove current Functions support, so the SDK/CLI remain pinned to 1.36.2. The separately installed Functions runtime dependency audit reported zero vulnerabilities.
