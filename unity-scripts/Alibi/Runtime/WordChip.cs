// A word pulled out of a suspect's caption. The player pinches it, carries it
// to a real object and lets go. Grabbing uses Meta's Interaction SDK: build the
// prefab with the menu item Alibi > 2. Create Word Chip Prefab.

using System.Collections;
using Alibi.Core;
using Oculus.Interaction;
using Oculus.Interaction.HandGrab;
using TMPro;
using UnityEngine;

namespace Alibi
{
    public class WordChip : MonoBehaviour
    {
        public TMP_Text label;
        public Grabbable grabbable;
        [Tooltip("How close (m) to a pin target counts as dropping on it.")]
        public float dropRadius = 0.15f;
        public float moveSeconds = 0.35f;

        public string WordId { get; private set; }
        public string SuspectId { get; private set; }
        public bool IsLocked { get; private set; }

        private CaseDirector _director;
        private Transform _home;
        private PinTarget _hovered;
        private bool _held;
        private readonly Collider[] _overlaps = new Collider[16];

        public void Init(CaseDirector director, CaptionWord word, string suspectId, Transform home)
        {
            _director = director;
            WordId = word.wordId;
            SuspectId = suspectId;
            _home = home;
            if (label != null) label.text = word.text;
            transform.SetPositionAndRotation(home.position, home.rotation);
        }

        private void Awake()
        {
            if (grabbable == null) grabbable = GetComponent<Grabbable>();
        }

        private void OnEnable()
        {
            if (grabbable != null) grabbable.WhenPointerEventRaised += HandlePointerEvent;
        }

        private void OnDisable()
        {
            if (grabbable != null) grabbable.WhenPointerEventRaised -= HandlePointerEvent;
            SetHovered(null);
        }

        private void HandlePointerEvent(PointerEvent evt)
        {
            if (IsLocked) return;
            switch (evt.Type)
            {
                case PointerEventType.Select:
                    _held = true;
                    StopAllCoroutines();
                    break;
                case PointerEventType.Unselect:
                    if (!_held) break;
                    _held = false;
                    var target = FindTarget();
                    SetHovered(null);
                    _director.OnWordDropped(this, target);
                    break;
                case PointerEventType.Cancel:
                    _held = false;
                    SetHovered(null);
                    ReturnHome();
                    break;
            }
        }

        private void Update()
        {
            if (_held) SetHovered(FindTarget());
        }

        private PinTarget FindTarget()
        {
            int n = Physics.OverlapSphereNonAlloc(transform.position, dropRadius, _overlaps, ~0, QueryTriggerInteraction.Collide);
            PinTarget best = null;
            float bestDist = float.MaxValue;
            for (int i = 0; i < n; i++)
            {
                var t = _overlaps[i].GetComponentInParent<PinTarget>();
                if (t == null) continue;
                float d = (t.transform.position - transform.position).sqrMagnitude;
                if (d < bestDist)
                {
                    bestDist = d;
                    best = t;
                }
            }
            return best;
        }

        private void SetHovered(PinTarget target)
        {
            if (_hovered == target) return;
            if (_hovered != null) _hovered.SetHover(false);
            _hovered = target;
            if (_hovered != null) _hovered.SetHover(true);
        }

        /// <summary>Fly back to its place on the suspect's word rail.</summary>
        public void ReturnHome()
        {
            if (_home == null || IsLocked) return;
            StopAllCoroutines();
            StartCoroutine(MoveTo(_home, Vector3.zero));
        }

        /// <summary>Correct pin: stick to the object and stop being grabbable.</summary>
        public void AttachTo(PinTarget target)
        {
            IsLocked = true;
            SetGrabbable(false);
            StopAllCoroutines();
            StartCoroutine(MoveTo(target.transform, Vector3.up * 0.06f));
        }

        private void SetGrabbable(bool on)
        {
            foreach (var i in GetComponentsInChildren<HandGrabInteractable>(true)) i.enabled = on;
            foreach (var i in GetComponentsInChildren<GrabInteractable>(true)) i.enabled = on;
        }

        private IEnumerator MoveTo(Transform anchor, Vector3 offset)
        {
            Vector3 fromPos = transform.position;
            Quaternion fromRot = transform.rotation;
            for (float t = 0f; t < 1f; t += Time.deltaTime / moveSeconds)
            {
                float k = Mathf.SmoothStep(0f, 1f, t);
                transform.SetPositionAndRotation(
                    Vector3.Lerp(fromPos, anchor.position + offset, k),
                    Quaternion.Slerp(fromRot, anchor.rotation, k));
                yield return null;
            }
            transform.SetPositionAndRotation(anchor.position + offset, anchor.rotation);
            if (IsLocked) transform.SetParent(anchor, true);
        }
    }
}
