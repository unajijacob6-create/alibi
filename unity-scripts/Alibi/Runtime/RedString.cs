// The red string between a suspect's words and a real object. It sags when a
// pin is wrong and pulls tight when it is right.

using System.Collections;
using UnityEngine;

namespace Alibi
{
    [RequireComponent(typeof(LineRenderer))]
    public class RedString : MonoBehaviour
    {
        public int segments = 24;
        public float slackSag = 0.18f;
        public float tautSag = 0.004f;
        public float width = 0.003f;

        private Transform _from;
        private Transform _to;
        private float _sag;
        private float _targetSag;
        private LineRenderer _line;

        public static RedString Create(Transform from, Transform to, Material material, Color color)
        {
            var go = new GameObject("RedString");
            var line = go.AddComponent<LineRenderer>();
            line.useWorldSpace = true;
            line.material = material;
            line.startColor = color;
            line.endColor = color;
            var s = go.AddComponent<RedString>();
            s._from = from;
            s._to = to;
            s._line = line;
            s._sag = s.slackSag;
            s._targetSag = s.slackSag;
            line.positionCount = s.segments + 1;
            line.widthMultiplier = s.width;
            return s;
        }

        public void SetTaut(bool taut) => _targetSag = taut ? tautSag : slackSag;

        /// <summary>The finale: a brief swell in thickness.</summary>
        public void Pulse(float seconds = 1.2f) => StartCoroutine(PulseRoutine(seconds));

        public void FadeAndDestroy(float seconds) => StartCoroutine(FadeRoutine(seconds));

        private void LateUpdate()
        {
            if (_from == null || _to == null)
            {
                Destroy(gameObject);
                return;
            }
            _sag = Mathf.Lerp(_sag, _targetSag, Time.deltaTime * 6f);
            Vector3 a = _from.position, b = _to.position;
            for (int i = 0; i <= segments; i++)
            {
                float t = i / (float)segments;
                _line.SetPosition(i, Vector3.Lerp(a, b, t) + Vector3.down * (_sag * 4f * t * (1f - t)));
            }
        }

        private IEnumerator PulseRoutine(float seconds)
        {
            for (float t = 0f; t < seconds; t += Time.deltaTime)
            {
                _line.widthMultiplier = width * (1f + 2.5f * Mathf.Sin(Mathf.PI * t / seconds));
                yield return null;
            }
            _line.widthMultiplier = width;
        }

        private IEnumerator FadeRoutine(float seconds)
        {
            Color start = _line.startColor;
            for (float t = 0f; t < seconds; t += Time.deltaTime)
            {
                var c = start;
                c.a = 1f - t / seconds;
                _line.startColor = c;
                _line.endColor = c;
                yield return null;
            }
            Destroy(gameObject);
        }
    }
}
