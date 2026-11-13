// Talks to the case service (case-service/ in this repo) over HTTP.
// The API key for Claude lives on the server, never on the headset.

using System;
using System.Collections;
using System.Text;
using Alibi.Core;
using UnityEngine;
using UnityEngine.Networking;

namespace Alibi
{
    public class AlibiServiceClient : MonoBehaviour
    {
        [Tooltip("Where the case service runs, e.g. http://192.168.1.20:8787 for a laptop on the same Wi-Fi.")]
        public string baseUrl = "http://192.168.1.20:8787";

        [Tooltip("Must match ALIBI_CLIENT_TOKEN on the server, if that is set. Leave empty otherwise.")]
        public string clientToken = "";

        public int scanTimeoutSeconds = 60;
        public int caseTimeoutSeconds = 60;

        public IEnumerator Scan(ScanRequest request, Action<ScanResponse> onDone, Action<string> onError) =>
            Post("/v1/scan", JsonUtility.ToJson(request), scanTimeoutSeconds,
                json => onDone(JsonUtility.FromJson<ScanResponse>(json)), onError);

        public IEnumerator BuildCase(CaseRequest request, Action<CaseResponse> onDone, Action<string> onError) =>
            Post("/v1/case", JsonUtility.ToJson(request), caseTimeoutSeconds,
                json => onDone(JsonUtility.FromJson<CaseResponse>(json)), onError);

        private IEnumerator Post(string path, string body, int timeoutSeconds, Action<string> onDone, Action<string> onError)
        {
            using (var req = new UnityWebRequest(baseUrl.TrimEnd('/') + path, UnityWebRequest.kHttpVerbPOST))
            {
                req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                if (!string.IsNullOrEmpty(clientToken)) req.SetRequestHeader("x-alibi-token", clientToken);
                req.timeout = timeoutSeconds;

                yield return req.SendWebRequest();

                if (req.result != UnityWebRequest.Result.Success)
                {
                    onError($"{path} failed ({req.responseCode}): {req.error} {req.downloadHandler?.text}");
                    yield break;
                }
                try
                {
                    onDone(req.downloadHandler.text);
                }
                catch (Exception e)
                {
                    onError($"{path} returned something unreadable: {e.Message}");
                }
            }
        }
    }
}
