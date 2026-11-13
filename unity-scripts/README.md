# Alibi: Unity scripts

C# scripts for the headset side of Alibi. They scan the room, place the real objects
in 3D, play the case, and handle grabbing words and pinning them to objects.

| Folder | What it is |
|---|---|
| `Alibi/` | **Copy this into your Unity project's `Assets/` folder.** |
| `Alibi/Runtime/Core/` | Game rules and data types. No Unity code, tested with `dotnet test`. |
| `Alibi/Runtime/` | Unity components (listed below). |
| `Alibi/Editor/` | The `Alibi` menu that builds prefabs and the stage. |
| `Alibi/Data/backup-apartment-case.json` | A ready-made case for the backup apartment. |
| `CoreTests/` | Tests for `Runtime/Core`. **Do not copy into Unity.** |

## Status

- All scripts compile against stand-ins for the Unity and Meta APIs they use. The Meta
  names were checked against Meta's API reference (`PassthroughCameraAccess`,
  `EnvironmentRaycastManager`, `Grabbable`, `PointerEvent`, the Quick Actions API).
- The game rules (`CaseState`, `CaptionTiming`) pass 8 tests, including reading a real
  case file from the service.
- **Not yet run inside Unity or on a headset.** Expect to tune sizes and positions, and
  check the items under "First run on the headset".

## Setup

**Unity 6000.0.66f2 or later** (the version Meta's camera and depth samples require).

1. **Packages** (Window > Package Manager, or Meta's Project Setup Tool):
   - Meta XR Core SDK
   - Meta XR Interaction SDK, the `com.meta.xr.sdk.interaction.ovr` package (not the plain `com.meta.xr.sdk.interaction`)
   - Meta MR Utility Kit (MRUK), for the camera and depth raycasts
   - TextMeshPro: import its essential resources when Unity asks
2. **Copy** `unity-scripts/Alibi` into `Assets/Alibi`.
3. **Window > Meta > Tools > Project Setup Tool**: fix everything it lists.
4. **Building Blocks:** add **Passthrough**.
5. **On the OVRManager** (on the camera rig):
   - turn on **Passthrough Camera Access**
   - set hand tracking to hands (with or without controllers)
   - request the camera and scene permissions at startup (the Permission Requests On
     Startup section). Meta's docs say to request permissions from one place only.
6. **AndroidManifest** must contain `horizonos.permission.HEADSET_CAMERA` (the camera)
   and `com.oculus.permission.USE_SCENE` (depth raycasts).
7. Delete the scene's default **Main Camera**, then run the menu items in order:
   - **Alibi > 1. Add Interaction Rig (hands)**
   - **Alibi > 2. Create Word Chip Prefab**
   - **Alibi > 3. Create Pin Target and Prop Prefabs**
   - **Alibi > 4. Add Alibi Stage to Scene**
8. On the new **Alibi** object, set **AlibiServiceClient > Base Url** to wherever the
   case service runs (see below).

## The case service

During development, run it on a laptop on the same Wi-Fi as the Quest:

```bash
cd case-service
```
```bash
npm start
```

Then use `http://<laptop IP>:8787` as the Base Url. Android blocks plain `http://` by
default: set **Player Settings > Other Settings > Allow downloads over HTTP** to allowed.

**Before submitting:** judges' headsets can't reach your laptop. Deploy the service to
a public `https://` host and point the Base Url there. Until then, the app falls back
to the backup apartment and its bundled case.

## The backup apartment

This is used when the camera, scan or network fails, and in the editor or simulator.
The XR Simulator does not support the passthrough camera.

1. Build a small virtual room with the 9 objects in
   `case-service/rooms/backup-apartment.json` (mug, book, poster, record sleeve, wine
   bottle, calendar, umbrella, lamp, clock). Show each object's printed text on it.
2. Add a **PinTarget** to each object. Set **Object Id**, **Label** and **Printed Text**
   exactly as in that file (for example `apt-mug`, `mug`, `MARGATE DINER`).
3. Put them all under one GameObject and drag it into **CaseDirector > Backup Apartment**.
4. Drag `Alibi/Data/backup-apartment-case.json` into **CaseDirector > Bundled Case**.

To regenerate the bundled case, for example with Claude writing the dialogue:

```bash
node scripts/export-case.ts --room-file=rooms/backup-apartment.json --seed=1 --llm --out=../unity-scripts/Alibi/Data/backup-apartment-case.json
```

Run it from `case-service/` with `ANTHROPIC_API_KEY` set. Without `--llm` it uses the
offline writer.

**To test in the editor:** untick **CaseDirector > Use Live Scan**, and the game goes
straight to the backup apartment.

## How a case plays

| Step | Script |
|---|---|
| The player looks around. Frames are captured, with a grid of depth readings for each | `RoomScanCapture` |
| Frames go to `/v1/scan`; each object is placed in 3D from its frame and depth grid | `AlibiServiceClient`, `RoomAnchoring` |
| `/v1/case` builds the case; props spawn on the table if the room was bare | `CaseDirector` |
| Suspects take the chair; the liar glances at an object just before saying its word | `SuspectPresenter`, `CaptionTiming` |
| Grabbable words collect on a rail under the captions | `CaptionPanel`, `WordChip` |
| Pinch a word, carry it to an object, let go: the string snaps tight or falls slack | `WordChip`, `PinTarget`, `CaseState`, `RedString` |
| Three correct pins: confession, then every string pulses | `CaseDirector` |

## First run on the headset

1. **Image orientation.** Tick **RoomScanCapture > Save Debug Frames**, play once, and
   pull the frames from the app's `persistentDataPath`. If they are upside down, tick
   **Flip Vertically**. If it's wrong, every object lands in the wrong place.
2. **Placement.** Watch the logs (`metavr adb logcat --follow --tag Unity`) for
   `[Alibi] Scan found N objects, placed M`. You need at least 3 placed, ideally 5 or more.
3. **Sizes.** Text sizes and stage offsets are first guesses. Adjust the Stage children
   (Captions, Word Rails, Suspect Chair, Props Spot) so captions sit in the centre of
   view and the word rail is within a seated arm's reach. Meta VR Glasses have a much
   narrower field of view than Quest 3, so keep everything near the centre.
4. **Grabbing.** If words can't be grabbed, check that the scene has the interaction
   rig from step 1 (it supplies the hand-grab interactors).

## Not built yet

- Voices: suspects show captions only, and timing is estimated from text length
- Real character art: the suspect is a placeholder capsule and sphere
- The backup apartment's 3D models
- A public deployment of the case service
