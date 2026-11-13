# Alibi

A seated, hands-only mixed-reality murder mystery for Meta Quest, built for the
Meta VR Start Developer Competition 2026.

One suspect lies by borrowing words printed on things in your real room. Grab the
suspicious words out of the captions and pin them on the objects they came from.
Three correct pins break the liar.

| Folder | What it is |
|---|---|
| `case-service/` | Node service that scans the room and builds a solvable case. See its README. |
| `unity-scripts/` | C# scripts for the headset: scan, placement, captions, grabbing and pinning. See its README. |

## Putting the case service online

The headset needs the case service on a public `https://` address. The repo includes a
Render Blueprint (`render.yaml`) for it.

1. Merge the pull request that adds `render.yaml` into `main`.
2. Open https://dashboard.render.com/blueprint/new?repo=https://github.com/unajijacob6-create/alibi
   and sign in to Render with GitHub. Allow access to this repo.
3. When asked, paste your Anthropic API key into `ANTHROPIC_API_KEY`, then click **Apply**.
4. When the deploy is live, open `https://<service-name>.onrender.com/health`. It should
   show `{"ok":true}`.
5. In Unity, set **AlibiServiceClient > Base Url** to that address, and **Client Token**
   to the `ALIBI_CLIENT_TOKEN` value shown in the service's Environment tab.

**Free vs paid:** the free plan sleeps after 15 minutes without traffic and takes about a
minute to wake. The headset pings the server at launch to wake it, but a judge could still
land in the backup apartment. Switch the service to the **Starter** plan before judging starts.

The API key stays on Render. The service limits requests per device and per day
(`ALIBI_LIMIT_PER_CLIENT_PER_HOUR`, `ALIBI_LIMIT_PER_DAY`) to protect your Anthropic bill.
