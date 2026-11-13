// The 10-second look-around: grabs camera frames for the room scan and, for
// each frame, samples a grid of depth readings while the depth camera is still
// pointing the same way. Objects are placed in 3D later from those readings,
// because a live depth raycast only hits what is in view right now.

using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using Alibi.Core;
using Meta.XR;
using UnityEngine;

namespace Alibi
{
    public class CapturedFrame
    {
        public byte[] Jpeg;
        /// <summary>World pose of the camera when the image was taken.</summary>
        public Pose CameraPose;
        /// <summary>Depth samples, row-major from the bottom-left (viewport space). NaN = no hit.</summary>
        public float[] Depth;
        public int GridWidth;
        public int GridHeight;
    }

    public class RoomScanCapture : MonoBehaviour
    {
        public PassthroughCameraAccess cameraAccess;
        public EnvironmentRaycastManager raycastManager;

        [Tooltip("Frames sent to the scan. 6-8 covers a room; each one adds cost and upload time.")]
        public int frameCount = 8;
        [Tooltip("Seconds between frames while the player looks around.")]
        public float secondsBetweenFrames = 1.2f;
        [Range(40, 95)] public int jpegQuality = 80;

        [Header("Depth grid sampled with each frame")]
        public int gridWidth = 16;
        public int gridHeight = 12;
        public float maxDepthMeters = 6f;

        [Header("Debugging")]
        [Tooltip("Turn on if saved debug frames are upside down.")]
        public bool flipVertically = false;
        [Tooltip("Writes each frame to Application.persistentDataPath as alibi-frame-N.jpg.")]
        public bool saveDebugFrames = false;

        public readonly List<CapturedFrame> Frames = new List<CapturedFrame>();

        public static bool IsSupported => PassthroughCameraAccess.IsSupported && EnvironmentRaycastManager.IsSupported;

        public IEnumerator Capture(Action<string> onError)
        {
            Frames.Clear();
            if (!IsSupported)
            {
                onError("Passthrough camera or depth raycasting is not supported on this device.");
                yield break;
            }

            float waited = 0f;
            while (!cameraAccess.IsPlaying)
            {
                // The camera needs the HEADSET_CAMERA permission and passthrough enabled.
                if (waited > 6f)
                {
                    onError("The passthrough camera did not start. Check the camera permission.");
                    yield break;
                }
                waited += Time.unscaledDeltaTime;
                yield return null;
            }

            for (int i = 0; i < frameCount; i++)
            {
                if (i > 0) yield return new WaitForSeconds(secondsBetweenFrames);
                while (!cameraAccess.IsUpdatedThisFrame) yield return null;

                // Pose and image together, as Meta's guidance recommends.
                var pose = cameraAccess.GetCameraPose();
                var frame = new CapturedFrame
                {
                    Jpeg = EncodeCurrentImage(),
                    CameraPose = pose,
                    GridWidth = gridWidth,
                    GridHeight = gridHeight,
                    Depth = SampleDepth(pose),
                };
                Frames.Add(frame);

                if (saveDebugFrames)
                {
                    File.WriteAllBytes(Path.Combine(Application.persistentDataPath, $"alibi-frame-{i}.jpg"), frame.Jpeg);
                }
            }
        }

        public ScanRequest ToRequest()
        {
            var frames = new ScanFrame[Frames.Count];
            for (int i = 0; i < Frames.Count; i++)
            {
                frames[i] = new ScanFrame { jpegBase64 = Convert.ToBase64String(Frames[i].Jpeg) };
            }
            return new ScanRequest { frames = frames };
        }

        private byte[] EncodeCurrentImage()
        {
            var size = cameraAccess.CurrentResolution;
            var colors = cameraAccess.GetColors(); // do not keep or dispose (Meta's guidance)
            var tex = new Texture2D(size.x, size.y, TextureFormat.RGBA32, false);
            try
            {
                tex.SetPixelData(colors, 0);
                if (flipVertically) FlipRows(tex);
                tex.Apply(false);
                return tex.EncodeToJPG(jpegQuality);
            }
            finally
            {
                Destroy(tex);
            }
        }

        private static void FlipRows(Texture2D tex)
        {
            var px = tex.GetPixels32();
            int w = tex.width, h = tex.height;
            var row = new Color32[w];
            for (int y = 0; y < h / 2; y++)
            {
                Array.Copy(px, y * w, row, 0, w);
                Array.Copy(px, (h - 1 - y) * w, px, y * w, w);
                Array.Copy(row, 0, px, (h - 1 - y) * w, w);
            }
            tex.SetPixels32(px);
        }

        private float[] SampleDepth(Pose pose)
        {
            var depth = new float[gridWidth * gridHeight];
            for (int gy = 0; gy < gridHeight; gy++)
            {
                for (int gx = 0; gx < gridWidth; gx++)
                {
                    var viewport = new Vector2((gx + 0.5f) / gridWidth, (gy + 0.5f) / gridHeight);
                    var ray = cameraAccess.ViewportPointToRay(viewport, pose);
                    depth[gy * gridWidth + gx] = raycastManager.Raycast(ray, out var hit, maxDepthMeters)
                        ? Vector3.Distance(ray.origin, hit.point)
                        : float.NaN;
                }
            }
            return depth;
        }
    }
}
