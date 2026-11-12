# Alibi case service

Builds an Alibi murder mystery from the objects in the player's real room, and
proves every case is fair before the player sees it.

One suspect lies by borrowing words printed on things in the room, like the
"Kobayashi" mug in *The Usual Suspects*. The player grabs words from the captions
and pins them on the real objects. Three correct pins break the liar.

## How a case is built

```
camera frames ──► /v1/scan (Claude reads printed text) ──► room objects
                                                              │
                 headset places each object in 3D ◄───────────┘
                                                              │
room objects ──► /v1/case:
                   1. planner (code)   decides who lies, which 3 words, which objects
                   2. writer (Claude)  writes noir dialogue around those words
                   3. solver (code)    checks the case; on failure, Claude rewrites once
                   4. template writer  offline fallback that always passes
                 ──► CaseFile JSON for the headset
```

Claude never decides the logic, so a case can't come out unsolvable. The solver
only uses the finished case and the room, with the same word rules the headset
uses for pinning. It guarantees:

- exactly one liar, with exactly 3 words that pin to 3 different objects, all visible from the seat
- each innocent has one tempting word that pins to nothing (a red herring)
- no room word appears anywhere unless it is one of the liar's marked words
- suspect and victim names share no word with the room
- the answer key (pins, herrings, glances) in the file matches what the solver works out

If the room has fewer than 3 usable objects, the planner adds props (a matchbook,
a photograph, a ticket) for the headset to place on the table.

## Run it

Needs Node 22.18 or newer (runs TypeScript directly, no build step).

```bash
npm install
```

```bash
npm test
```

```bash
npm run demo -- --room=bedroom --seed=42
```

The demo prints a case as a readable script with its answer key. Add `--llm` to
have Claude write the dialogue; that needs Anthropic credentials (`ANTHROPIC_API_KEY`).

```bash
ANTHROPIC_API_KEY=... npm start
```

Starts the server on port 8787 (`PORT` to change). Set `ALIBI_CLIENT_TOKEN` to
require the header `x-alibi-token` on every request.

## API for the headset

### `POST /v1/scan`

Send 6 to 12 JPEG frames from the player's look-around, taken from their seat.

```json
{ "frames": [{ "jpegBase64": "..." }] }
```

Returns objects with readable text, each with one or more sightings (frame index
and a box in 0..1 frame coordinates):

```json
{ "objects": [{ "id": "obj-1", "label": "mug", "text": ["KOBAYASHI"], "clueWord": "KOBAYASHI",
  "visibleFromSeat": true, "confidence": 0.95,
  "sightings": [{ "frameIndex": 2, "box": { "x": 0.41, "y": 0.55, "w": 0.08, "h": 0.12 } }] }] }
```

The headset should place each object in 3D by casting a ray through the centre of
its box using that frame's camera pose. If placement fails, set
`visibleFromSeat: false` or drop the object. A `503` means the scan is unavailable:
switch to the pre-built apartment.

Claude is told to skip people, screens and private papers; frames are not stored or logged.

### `POST /v1/case`

```json
{ "room": [ ...objects from /v1/scan, with sightings removed... ], "seed": 1234, "offline": false }
```

`offline: true` skips Claude and uses the template writer, which is instant and
needs no internet. The response is `{ caseFile, attempts }`; `attempts` shows which
writer ran and why any draft was rejected.

### Playing a `CaseFile`

| Field | What the headset does with it |
|---|---|
| `intro` | Narrator lines, played during the opening |
| `suspects[].lines[]` | Captions. `text` is display text; `words[]` are the grabbable words, with `start`/`end` character positions |
| `pins` | Dropping `wordId` on `objectId` snaps the red string tight and shows `label` on the object |
| `herrings` | Dropping one of these anywhere: string falls slack, show `rebuttal` |
| `glances` | The liar looks at `objectId` this many ms before saying `wordId` (the fair-play hint) |
| `props` | Spawn these on the player's table before the first suspect speaks |
| `confession` | The liar's last line once all three pins are made |

Any other drop (a correct word on the wrong object) also falls slack.

## Files

| Path | Purpose |
|---|---|
| `src/planner.ts` | Decides the case logic from the room, with a seeded random generator |
| `src/tokens.ts` | Word rules: which words count, which make good lies, what pins to what |
| `src/solver.ts` | Independent checker that every case must pass |
| `src/writer-llm.ts` | Claude writes the dialogue (structured output, model `claude-haiku-5-5`) |
| `src/writer-template.ts` | Offline writer used as the fallback |
| `src/assemble.ts` | Turns plan and dialogue into the `CaseFile` |
| `src/generate.ts` | Plan, write, check, rewrite once, fall back |
| `src/vision.ts` | Room scan with Claude vision |
| `src/server.ts` | HTTP endpoints |

## Not done yet

- Voice lines (text to speech) and the word timings needed to time the glances
- The Unity client: scan capture, 3D placement, captions, pinning, the pre-built apartment
- Deployment (any Node 22 host works; nothing here is tied to one provider)
- A live run of the Claude writer and scanner: the tests use fake writers and a fake scanner
