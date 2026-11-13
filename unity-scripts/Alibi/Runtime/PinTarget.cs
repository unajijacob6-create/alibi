// A spot on a real (or backup-apartment) object where words can be pinned.
// Invisible until a held word comes near it, so it never gives away the answer.

using System;
using Alibi.Core;
using TMPro;
using UnityEngine;

namespace Alibi
{
    public class PinTarget : MonoBehaviour
    {
        [Header("The object (fill these in for hand-placed backup-apartment objects)")]
        public string objectId;
        public string label;
        [Tooltip("Readable printed text on the object, e.g. KOBAYASHI.")]
        public string[] printedText = Array.Empty<string>();
        [Tooltip("Optional: the most distinctive word in the text.")]
        public string clueWord;

        [Header("Visuals (optional)")]
        [Tooltip("Shown when a held word is close enough to drop here.")]
        public Renderer hoverMarker;
        [Tooltip("Shows the pin label, e.g. KOBAYASHI, printed on the mug.")]
        public TMP_Text pinLabel;
        [Tooltip("For virtual props only: shows the printed text, e.g. THE VESPERTINE CLUB.")]
        public TMP_Text printedTextDisplay;
        [Tooltip("Drop radius in meters.")]
        public float radius = 0.12f;

        public bool IsPinned { get; private set; }

        private Transform _viewer;

        private void Awake()
        {
            if (!TryGetComponent<SphereCollider>(out var col)) col = gameObject.AddComponent<SphereCollider>();
            col.isTrigger = true;
            col.radius = radius;
            if (pinLabel != null) pinLabel.gameObject.SetActive(false);
            SetHover(false);
            if (Camera.main != null) _viewer = Camera.main.transform;
        }

        /// <summary>Fill in from a scanned object or a prop.</summary>
        public void Configure(RoomObject obj)
        {
            objectId = obj.id;
            label = obj.label;
            printedText = obj.text ?? Array.Empty<string>();
            clueWord = obj.clueWord;
            gameObject.name = $"PinTarget {obj.id} ({obj.label})";
            if (printedTextDisplay != null) printedTextDisplay.text = string.Join("\n", printedText);
        }

        public RoomObject ToRoomObject() => new RoomObject
        {
            id = objectId,
            label = label,
            text = printedText,
            clueWord = clueWord,
            visibleFromSeat = true,
            confidence = 1f,
        };

        public void SetHover(bool on)
        {
            if (hoverMarker != null) hoverMarker.enabled = on && !IsPinned;
        }

        public void ShowPinned(string text)
        {
            IsPinned = true;
            SetHover(false);
            if (pinLabel != null)
            {
                pinLabel.text = text;
                pinLabel.gameObject.SetActive(true);
            }
        }

        private void LateUpdate()
        {
            // Keep the label readable from the seat.
            if (pinLabel != null && pinLabel.gameObject.activeSelf && _viewer != null)
            {
                var away = pinLabel.transform.position - _viewer.position;
                if (away.sqrMagnitude > 1e-6f) pinLabel.transform.rotation = Quaternion.LookRotation(away, Vector3.up);
            }
        }
    }
}
