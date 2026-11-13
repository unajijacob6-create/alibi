// Places each scanned object in the real room, using the frame it was seen in
// and the depth grid sampled with that frame.

using System.Collections.Generic;
using Alibi.Core;
using Meta.XR;
using UnityEngine;

namespace Alibi
{
    public class RoomAnchoring : MonoBehaviour
    {
        public PassthroughCameraAccess cameraAccess;

        [Tooltip("Optional prefab with a PinTarget. A plain one is created when empty.")]
        public PinTarget pinTargetPrefab;

        [Tooltip("Add an OVRSpatialAnchor so placed objects don't drift. Turn off if MRUK world locking is on.")]
        public bool addSpatialAnchors = true;

        [Tooltip("How many grid cells away to look for a depth reading when the nearest one missed.")]
        public int searchRadiusCells = 2;

        /// <summary>Place one object, or return null if no depth reading was near it.</summary>
        public PinTarget Place(ScannedObject obj, IReadOnlyList<CapturedFrame> frames)
        {
            if (obj.sightings == null) return null;

            // Try the largest sighting first: the object is clearest there.
            var sightings = new List<Sighting>(obj.sightings);
            sightings.Sort((a, b) => (b.box.w * b.box.h).CompareTo(a.box.w * a.box.h));

            foreach (var s in sightings)
            {
                if (s.frameIndex < 0 || s.frameIndex >= frames.Count) continue;
                var frame = frames[s.frameIndex];

                // The scan's boxes are image space (top-left origin, Y down);
                // Unity viewport space is bottom-left origin, Y up.
                var center = new Vector2(s.box.x + s.box.w / 2f, 1f - (s.box.y + s.box.h / 2f));
                if (!TryDepthAt(frame, center, out float distance)) continue;

                var ray = cameraAccess.ViewportPointToRay(center, frame.CameraPose);
                var point = ray.GetPoint(distance);
                var target = CreateTarget(obj, point, Quaternion.LookRotation(-ray.direction, Vector3.up));
                return target;
            }
            return null;
        }

        private bool TryDepthAt(CapturedFrame frame, Vector2 viewport, out float distance)
        {
            int cx = Mathf.Clamp(Mathf.FloorToInt(viewport.x * frame.GridWidth), 0, frame.GridWidth - 1);
            int cy = Mathf.Clamp(Mathf.FloorToInt(viewport.y * frame.GridHeight), 0, frame.GridHeight - 1);

            // Nearest cell with a reading, searching outwards ring by ring.
            for (int r = 0; r <= searchRadiusCells; r++)
            {
                float best = float.NaN;
                int bestDist = int.MaxValue;
                for (int dy = -r; dy <= r; dy++)
                {
                    for (int dx = -r; dx <= r; dx++)
                    {
                        if (Mathf.Max(Mathf.Abs(dx), Mathf.Abs(dy)) != r) continue;
                        int x = cx + dx, y = cy + dy;
                        if (x < 0 || y < 0 || x >= frame.GridWidth || y >= frame.GridHeight) continue;
                        float d = frame.Depth[y * frame.GridWidth + x];
                        int manhattan = Mathf.Abs(dx) + Mathf.Abs(dy);
                        if (!float.IsNaN(d) && manhattan < bestDist)
                        {
                            best = d;
                            bestDist = manhattan;
                        }
                    }
                }
                if (!float.IsNaN(best))
                {
                    distance = best;
                    return true;
                }
            }
            distance = 0f;
            return false;
        }

        private PinTarget CreateTarget(RoomObject obj, Vector3 position, Quaternion rotation)
        {
            PinTarget target;
            if (pinTargetPrefab != null)
            {
                target = Instantiate(pinTargetPrefab, position, rotation);
            }
            else
            {
                var go = new GameObject();
                go.transform.SetPositionAndRotation(position, rotation);
                target = go.AddComponent<PinTarget>();
            }
            target.Configure(obj);
            if (addSpatialAnchors) target.gameObject.AddComponent<OVRSpatialAnchor>();
            return target;
        }
    }
}
