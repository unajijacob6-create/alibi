// One-click setup, in the order a teammate runs them:
//   Alibi > 1. Add Interaction Rig (hands)
//   Alibi > 2. Create Word Chip Prefab
//   Alibi > 3. Create Pin Target and Prop Prefabs
//   Alibi > 4. Add Alibi Stage to Scene
// Grabbing is set up through Meta's Quick Actions API, as the Interaction SDK
// recommends, rather than by assembling its components by hand.

using System.IO;
using Alibi;
using Meta.XR;
using Oculus.Interaction;
using Oculus.Interaction.Editor.QuickActions;
using Oculus.Interaction.OVR.Editor.QuickActions;
using TMPro;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class AlibiSetupMenu
{
    private const string Root = "Assets/Alibi/Generated";
    private const string ChipPath = Root + "/WordChip.prefab";
    private const string TargetPath = Root + "/PinTarget.prefab";
    private const string PropPath = Root + "/PropCard.prefab";
    private const string StringMaterialPath = Root + "/RedString.mat";

    [MenuItem("Alibi/1. Add Interaction Rig (hands)")]
    private static void AddRig()
    {
        // Delete the default Main Camera first: the rig brings its own camera.
        OVRQuickActionsAPI.AddOVRInteractionRig();
        MarkDirty();
    }

    [MenuItem("Alibi/2. Create Word Chip Prefab")]
    private static void CreateWordChip()
    {
        EnsureFolder();
        var go = new GameObject("WordChip");
        var text = go.AddComponent<TextMeshPro>();
        text.text = "Word";
        text.fontSize = 0.3f;
        text.alignment = TextAlignmentOptions.Center;
        text.color = new Color(1f, 0.42f, 0.37f);
        text.fontStyle = FontStyles.Bold;
        text.rectTransform.sizeDelta = new Vector2(0.16f, 0.04f);

        var col = go.AddComponent<BoxCollider>();
        col.size = new Vector3(0.1f, 0.045f, 0.03f);

        // Adds Rigidbody (kinematic), Grabbable and a hand-grab interactable child.
        QuickActionsAPI.AddGrabInteraction(go);

        var chip = go.AddComponent<WordChip>();
        chip.label = text;
        chip.grabbable = go.GetComponent<Grabbable>();

        PrefabUtility.SaveAsPrefabAsset(go, ChipPath, out bool ok);
        Object.DestroyImmediate(go);
        Debug.Log(ok ? $"[Alibi] Saved {ChipPath}" : "[Alibi] Could not save the word chip prefab");
    }

    [MenuItem("Alibi/3. Create Pin Target and Prop Prefabs")]
    private static void CreateTargets()
    {
        EnsureFolder();

        // Pin target placed on real objects: an invisible spot that glows when a word is near.
        var target = new GameObject("PinTarget").AddComponent<PinTarget>();
        target.hoverMarker = Marker(target.transform);
        target.pinLabel = Label(target.transform, new Vector3(0f, 0.08f, 0f), 0.22f, Color.white);
        PrefabUtility.SaveAsPrefabAsset(target.gameObject, TargetPath, out bool ok1);
        Object.DestroyImmediate(target.gameObject);

        // Prop card the narrator places on the table when the room is too bare.
        var prop = new GameObject("PropCard").AddComponent<PinTarget>();
        var card = GameObject.CreatePrimitive(PrimitiveType.Quad);
        Object.DestroyImmediate(card.GetComponent<Collider>());
        card.name = "Card";
        card.transform.SetParent(prop.transform, false);
        card.transform.localScale = new Vector3(0.14f, 0.09f, 1f);
        prop.printedTextDisplay = Label(prop.transform, new Vector3(0f, 0f, -0.002f), 0.18f, new Color(0.12f, 0.1f, 0.08f));
        prop.hoverMarker = Marker(prop.transform);
        prop.pinLabel = Label(prop.transform, new Vector3(0f, 0.09f, 0f), 0.22f, Color.white);
        PrefabUtility.SaveAsPrefabAsset(prop.gameObject, PropPath, out bool ok2);
        Object.DestroyImmediate(prop.gameObject);

        Debug.Log(ok1 && ok2 ? $"[Alibi] Saved {TargetPath} and {PropPath}" : "[Alibi] Could not save the target prefabs");
    }

    [MenuItem("Alibi/4. Add Alibi Stage to Scene")]
    private static void AddStage()
    {
        var chip = AssetDatabase.LoadAssetAtPath<WordChip>(ChipPath);
        var target = AssetDatabase.LoadAssetAtPath<PinTarget>(TargetPath);
        var prop = AssetDatabase.LoadAssetAtPath<PinTarget>(PropPath);
        if (chip == null || target == null || prop == null)
        {
            EditorUtility.DisplayDialog("Alibi", "Run steps 2 and 3 first to create the prefabs.", "OK");
            return;
        }

        var root = new GameObject("Alibi");
        var service = root.AddComponent<AlibiServiceClient>();
        var director = root.AddComponent<CaseDirector>();

        // Room scan: camera access, depth raycasts, capture and placement.
        var scan = new GameObject("Room Scan");
        scan.transform.SetParent(root.transform, false);
        var camera = scan.AddComponent<PassthroughCameraAccess>();
        var raycaster = scan.AddComponent<EnvironmentRaycastManager>();
        var capture = scan.AddComponent<RoomScanCapture>();
        capture.cameraAccess = camera;
        capture.raycastManager = raycaster;
        var anchoring = scan.AddComponent<RoomAnchoring>();
        anchoring.cameraAccess = camera;
        anchoring.pinTargetPrefab = target;

        // Stage, laid out relative to the seated player's head (moved there at start).
        var stage = new GameObject("Stage").transform;
        stage.SetParent(root.transform, false);

        var captionsGo = new GameObject("Captions");
        captionsGo.transform.SetParent(stage, false);
        captionsGo.transform.localPosition = new Vector3(0f, -0.05f, 0.75f);
        var captions = captionsGo.AddComponent<CaptionPanel>();
        captions.speakerText = Label(captionsGo.transform, new Vector3(0f, 0.07f, 0f), 0.3f, new Color(1f, 0.85f, 0.55f));
        captions.lineText = Label(captionsGo.transform, Vector3.zero, 0.34f, Color.white, 0.62f);
        captions.hintText = Label(captionsGo.transform, new Vector3(0f, -0.08f, 0f), 0.24f, new Color(0.75f, 0.9f, 1f), 0.62f);

        var rails = new GameObject("Word Rails").transform;
        rails.SetParent(stage, false);
        rails.localPosition = new Vector3(-0.24f, -0.33f, 0.42f); // within a seated arm's reach
        captions.railsRoot = rails;
        captions.chipPrefab = chip;
        captions.railLabelTemplate = Label(rails, Vector3.zero, 0.22f, new Color(1f, 0.85f, 0.55f), 0.12f);

        var presenter = BuildPresenter(stage);
        var propsSpot = new GameObject("Props Spot").transform;
        propsSpot.SetParent(stage, false);
        propsSpot.localPosition = new Vector3(0f, -0.42f, 0.45f);

        director.service = service;
        director.scanCapture = capture;
        director.anchoring = anchoring;
        director.stageRoot = stage;
        director.propsSpot = propsSpot;
        director.propPrefab = prop;
        director.presenter = presenter;
        director.captions = captions;
        director.stringMaterial = StringMaterial();

        Selection.activeGameObject = root;
        MarkDirty();
        Debug.Log("[Alibi] Stage added. Set the service URL on Alibi > AlibiServiceClient, and see unity-scripts/README.md for the backup apartment.");
    }

    private static SuspectPresenter BuildPresenter(Transform stage)
    {
        var seat = new GameObject("Suspect Chair");
        seat.transform.SetParent(stage, false);
        seat.transform.localPosition = new Vector3(0f, -0.55f, 1.5f);
        seat.transform.localRotation = Quaternion.Euler(0f, 180f, 0f); // face the player

        var body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
        Object.DestroyImmediate(body.GetComponent<Collider>());
        body.name = "Body (placeholder)";
        body.transform.SetParent(seat.transform, false);
        body.transform.localScale = new Vector3(0.45f, 0.5f, 0.3f);

        var head = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        Object.DestroyImmediate(head.GetComponent<Collider>());
        head.name = "Head (placeholder)";
        head.transform.SetParent(seat.transform, false);
        head.transform.localPosition = new Vector3(0f, 0.68f, 0f);
        head.transform.localScale = Vector3.one * 0.22f;

        var presenter = seat.AddComponent<SuspectPresenter>();
        presenter.head = head.transform;
        presenter.tintedRenderers = new[] { body.GetComponent<Renderer>(), head.GetComponent<Renderer>() };
        presenter.nameplate = Label(seat.transform, new Vector3(0f, 0.95f, 0f), 0.3f, Color.white, 0.5f);
        presenter.nameplate.transform.localRotation = Quaternion.Euler(0f, 180f, 0f); // readable from the player
        seat.SetActive(false);
        return presenter;
    }

    private static TextMeshPro Label(Transform parent, Vector3 localPosition, float size, Color color, float width = 0.3f)
    {
        var go = new GameObject("Text");
        go.transform.SetParent(parent, false);
        var t = go.AddComponent<TextMeshPro>();
        t.fontSize = size;
        t.color = color;
        t.alignment = TextAlignmentOptions.Center;
        t.rectTransform.sizeDelta = new Vector2(width, 0.1f);
        go.transform.localPosition = localPosition;
        return t;
    }

    private static Renderer Marker(Transform parent)
    {
        var m = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        Object.DestroyImmediate(m.GetComponent<Collider>());
        m.name = "Hover Marker";
        m.transform.SetParent(parent, false);
        m.transform.localScale = Vector3.one * 0.04f;
        return m.GetComponent<Renderer>();
    }

    private static Material StringMaterial()
    {
        var existing = AssetDatabase.LoadAssetAtPath<Material>(StringMaterialPath);
        if (existing != null) return existing;
        var shader = Shader.Find("Universal Render Pipeline/Unlit");
        if (shader == null) shader = Shader.Find("Unlit/Color");
        if (shader == null) shader = Shader.Find("Sprites/Default");
        var mat = new Material(shader) { color = new Color(0.85f, 0.08f, 0.08f) };
        AssetDatabase.CreateAsset(mat, StringMaterialPath);
        return mat;
    }

    private static void EnsureFolder()
    {
        if (!AssetDatabase.IsValidFolder("Assets/Alibi")) AssetDatabase.CreateFolder("Assets", "Alibi");
        if (!AssetDatabase.IsValidFolder(Root)) AssetDatabase.CreateFolder("Assets/Alibi", Path.GetFileName(Root));
    }

    private static void MarkDirty() =>
        EditorSceneManager.MarkSceneDirty(EditorSceneManager.GetActiveScene());
}
