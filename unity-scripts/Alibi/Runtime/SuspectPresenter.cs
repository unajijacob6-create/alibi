// The hologram suspect in the chair across from the player. One presenter is
// reused for every suspect; they take turns in the chair.

using Alibi.Core;
using TMPro;
using UnityEngine;

namespace Alibi
{
    public class SuspectPresenter : MonoBehaviour
    {
        [Tooltip("Turns to look at the player, and glances at objects when lying.")]
        public Transform head;
        public Renderer[] tintedRenderers;
        public TMP_Text nameplate;
        public Color[] suspectColors =
        {
            new Color(0.45f, 0.75f, 1f, 0.8f),
            new Color(1f, 0.75f, 0.4f, 0.8f),
            new Color(0.7f, 1f, 0.6f, 0.8f),
        };
        public float turnSpeed = 7f;

        /// <summary>Where red strings start from when they come from this suspect.</summary>
        public Transform StringAnchor => head != null ? head : transform;

        private Transform _player;
        private Vector3 _glanceTarget;
        private float _glanceUntil;

        private void Start()
        {
            if (Camera.main != null) _player = Camera.main.transform;
        }

        public void Present(Suspect suspect, int index)
        {
            gameObject.SetActive(true);
            if (nameplate != null) nameplate.text = $"{suspect.name}\n<size=60%>{suspect.relation}</size>";
            var color = suspectColors.Length > 0 ? suspectColors[index % suspectColors.Length] : Color.white;
            foreach (var r in tintedRenderers)
            {
                if (r != null) r.material.color = color;
            }
            _glanceUntil = 0f;
        }

        public void Hide() => gameObject.SetActive(false);

        /// <summary>The liar's tell: a quick look at the object a lie came from.</summary>
        public void GlanceAt(Vector3 worldPoint, float holdSeconds = 0.6f)
        {
            _glanceTarget = worldPoint;
            _glanceUntil = Time.time + holdSeconds;
        }

        private void Update()
        {
            if (head == null) return;
            Vector3 target = Time.time < _glanceUntil
                ? _glanceTarget
                : (_player != null ? _player.position : head.position + transform.forward);
            var dir = target - head.position;
            if (dir.sqrMagnitude < 1e-4f) return;
            head.rotation = Quaternion.Slerp(head.rotation, Quaternion.LookRotation(dir, Vector3.up), Time.deltaTime * turnSpeed);
        }
    }
}
