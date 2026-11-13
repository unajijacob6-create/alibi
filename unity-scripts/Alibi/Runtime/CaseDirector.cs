// Runs one case from start to finish:
//   look-around scan -> place objects -> build the case -> intro -> suspects
//   speak (words collect on rails, the liar glances at objects) -> the player
//   pins words to objects -> three correct pins -> confession and finale.
//
// Nothing here can leave a judge stuck: if the camera, the scan or the network
// fails, it switches to the backup apartment and a case bundled with the build.

using System.Collections;
using System.Collections.Generic;
using Alibi.Core;
using UnityEngine;

namespace Alibi
{
    public class CaseDirector : MonoBehaviour
    {
        [Header("Service")]
        public AlibiServiceClient service;
        [Tooltip("Off: skip the camera and use the backup apartment (for testing, or the simulator).")]
        public bool useLiveScan = true;

        [Header("Room")]
        public RoomScanCapture scanCapture;
        public RoomAnchoring anchoring;
        [Tooltip("Virtual room with hand-placed PinTargets, used when the live scan can't run.")]
        public GameObject backupApartment;
        [Tooltip("A case exported for the backup apartment (case-service/scripts/export-case.ts). Used when the service is unreachable.")]
        public TextAsset bundledCase;
        [Tooltip("Fewer placed objects than this and the backup apartment is used instead.")]
        public int minPlacedObjects = 3;

        [Header("Stage")]
        [Tooltip("Parent of captions, word rails, suspect chair and props spot. Moved in front of the seated player at start.")]
        public Transform stageRoot;
        public bool placeStageInFrontOfPlayer = true;
        [Tooltip("Where the narrator puts props when the room is too bare: the player's table.")]
        public Transform propsSpot;
        public PinTarget propPrefab;
        public SuspectPresenter presenter;
        public CaptionPanel captions;

        [Header("Red string")]
        public Material stringMaterial;
        public Color stringColor = new Color(0.85f, 0.08f, 0.08f, 1f);

        [Header("Pacing (seconds)")]
        public float narrationLineSeconds = 3.5f;
        public float pauseBetweenSuspects = 1.2f;
        public float hintSeconds = 4f;

        private readonly Dictionary<string, PinTarget> _targets = new Dictionary<string, PinTarget>();
        private readonly List<RedString> _strings = new List<RedString>();
        private CaseState _state;
        private Coroutine _story;
        private float _startTime;

        public CaseState State => _state;

        private void Start()
        {
            if (backupApartment != null) backupApartment.SetActive(false);
            _startTime = Time.time;
            _story = StartCoroutine(RunCase());
        }

        private IEnumerator RunCase()
        {
            // 0. Put the stage in front of the player once head tracking has settled.
            yield return new WaitForSeconds(0.5f);
            PlaceStage();

            // 1. Read the room.
            List<RoomObject> room = null;
            bool usingBackup = false;
            if (useLiveScan && RoomScanCapture.IsSupported)
            {
                captions.ShowNarration("Take a slow look around the room, detective.");
                yield return ScanRoom(r => room = r);
            }
            if (room == null || CountPlaced(room) < minPlacedObjects)
            {
                room = UseBackupApartment();
                usingBackup = true;
            }

            // 2. Build the case.
            captions.ShowNarration("Someone in this room is lying. Listen closely.");
            CaseFile caseFile = null;
            string error = null;
            var request = new CaseRequest { room = room.ToArray(), seed = Random.Range(1, int.MaxValue), offline = false };
            yield return service.BuildCase(request, r => caseFile = r.caseFile, e => error = e);

            if (caseFile == null)
            {
                Debug.LogWarning($"[Alibi] Case service failed, using the bundled case: {error}");
                if (!usingBackup) room = UseBackupApartment();
                caseFile = LoadBundledCase();
            }
            if (caseFile == null)
            {
                captions.ShowNarration("The case files are missing. Check the case service and the bundled case.");
                yield break;
            }

            _state = new CaseState(caseFile);
            SpawnProps(caseFile.props);

            // 3. Intro.
            foreach (var line in caseFile.intro)
            {
                captions.ShowNarration(line);
                yield return new WaitForSeconds(narrationLineSeconds);
            }

            // 4. Each suspect gives their alibi. Pinning is allowed at any time.
            for (int i = 0; i < caseFile.suspects.Length; i++)
            {
                yield return Interrogate(caseFile.suspects[i], i, caseFile.glances);
                yield return new WaitForSeconds(pauseBetweenSuspects);
            }

            presenter.Hide();
            captions.ShowNarration("Pin their words to the things they came from.");
        }

        private void PlaceStage()
        {
            if (!placeStageInFrontOfPlayer || stageRoot == null || Camera.main == null) return;
            var head = Camera.main.transform;
            var forward = Vector3.ProjectOnPlane(head.forward, Vector3.up);
            if (forward.sqrMagnitude < 1e-4f) forward = Vector3.forward;
            stageRoot.SetPositionAndRotation(head.position, Quaternion.LookRotation(forward.normalized, Vector3.up));
        }

        private IEnumerator ScanRoom(System.Action<List<RoomObject>> done)
        {
            string error = null;
            yield return scanCapture.Capture(e => error = e);
            if (error != null)
            {
                Debug.LogWarning($"[Alibi] Capture failed: {error}");
                done(null);
                yield break;
            }

            ScanResponse scan = null;
            yield return service.Scan(scanCapture.ToRequest(), r => scan = r, e => error = e);
            if (scan == null || scan.objects == null)
            {
                Debug.LogWarning($"[Alibi] Scan failed: {error}");
                done(null);
                yield break;
            }

            var room = new List<RoomObject>();
            foreach (var obj in scan.objects)
            {
                var target = anchoring.Place(obj, scanCapture.Frames);
                obj.visibleFromSeat = target != null; // only placed objects can hold clues
                if (target != null) _targets[obj.id] = target;
                room.Add(obj);
            }
            Debug.Log($"[Alibi] Scan found {scan.objects.Length} objects, placed {_targets.Count}.");
            done(room);
        }

        private static int CountPlaced(List<RoomObject> room)
        {
            int n = 0;
            foreach (var o in room) if (o.visibleFromSeat) n++;
            return n;
        }

        private List<RoomObject> UseBackupApartment()
        {
            foreach (var t in _targets.Values) if (t != null) Destroy(t.gameObject);
            _targets.Clear();
            var room = new List<RoomObject>();
            if (backupApartment == null) return room;

            backupApartment.SetActive(true);
            foreach (var t in backupApartment.GetComponentsInChildren<PinTarget>(true))
            {
                _targets[t.objectId] = t;
                room.Add(t.ToRoomObject());
            }
            return room;
        }

        private CaseFile LoadBundledCase()
        {
            if (bundledCase == null) return null;
            var response = JsonUtility.FromJson<CaseResponse>(bundledCase.text);
            return response?.caseFile;
        }

        private void SpawnProps(RoomObject[] props)
        {
            if (props == null || props.Length == 0 || propPrefab == null || propsSpot == null) return;
            for (int i = 0; i < props.Length; i++)
            {
                float x = (i - (props.Length - 1) / 2f) * 0.18f;
                var t = Instantiate(propPrefab, propsSpot.TransformPoint(new Vector3(x, 0f, 0f)), propsSpot.rotation);
                t.Configure(props[i]);
                _targets[props[i].id] = t;
            }
        }

        private IEnumerator Interrogate(Suspect suspect, int index, Glance[] glances)
        {
            presenter.Present(suspect, index);
            yield return new WaitForSeconds(0.6f);

            foreach (var line in suspect.lines)
            {
                float speech = CaptionTiming.EstimateSpeechSeconds(line.text);
                var words = CaptionTiming.WordCues(line, speech);
                var glanceCues = suspect.isLiar ? CaptionTiming.GlanceCues(line, glances, speech) : new List<GlanceCue>();
                captions.ShowLine(suspect, line);

                int wi = 0, gi = 0;
                for (float t = 0f; t < speech; t += Time.deltaTime)
                {
                    while (gi < glanceCues.Count && glanceCues[gi].Time <= t)
                    {
                        if (_targets.TryGetValue(glanceCues[gi].ObjectId, out var target) && target != null)
                            presenter.GlanceAt(target.transform.position);
                        gi++;
                    }
                    while (wi < words.Count && words[wi].Time <= t)
                    {
                        captions.AddChip(this, suspect, words[wi].Word);
                        wi++;
                    }
                    yield return null;
                }
                for (; wi < words.Count; wi++) captions.AddChip(this, suspect, words[wi].Word);
                yield return new WaitForSeconds(CaptionTiming.LinePause);
            }
        }

        /// <summary>Called by a WordChip when the player lets go of it.</summary>
        public void OnWordDropped(WordChip chip, PinTarget target)
        {
            if (_state == null || target == null)
            {
                chip.ReturnHome();
                return;
            }

            var result = _state.TryPin(chip.WordId, target.objectId);
            switch (result.Outcome)
            {
                case PinOutcome.Correct:
                    chip.AttachTo(target);
                    target.ShowPinned(result.Message);
                    var taut = RedString.Create(captions.RailAnchor(chip.SuspectId), target.transform, stringMaterial, stringColor);
                    taut.SetTaut(true);
                    _strings.Add(taut);
                    if (result.SolvedNow) Solve();
                    break;

                case PinOutcome.Herring:
                case PinOutcome.WrongObject:
                    captions.ShowHint(result.Message, hintSeconds);
                    RedString.Create(captions.RailAnchor(chip.SuspectId), target.transform, stringMaterial, stringColor)
                        .FadeAndDestroy(1.2f);
                    chip.ReturnHome();
                    break;

                default:
                    chip.ReturnHome();
                    break;
            }
        }

        private void Solve()
        {
            if (_story != null) StopCoroutine(_story);
            StartCoroutine(Confession());
        }

        private IEnumerator Confession()
        {
            var liar = _state.Liar;
            int index = System.Array.IndexOf(_state.Case.suspects, liar);
            presenter.Present(liar, index);
            captions.ShowSpeech(liar.name, _state.Case.confession);
            yield return new WaitForSeconds(4.5f);

            // Finale: every string pulses at once.
            foreach (var s in _strings) if (s != null) s.Pulse();
            int seconds = Mathf.RoundToInt(Time.time - _startTime);
            string mistakes = _state.Mistakes == 1 ? "1 wrong pin" : $"{_state.Mistakes} wrong pins";
            captions.ShowNarration($"Case closed in {seconds / 60}:{seconds % 60:00}, with {mistakes}.");
        }
    }
}
