// Captions in front of the player, plus one "word rail" per suspect where the
// grabbable words collect as they are spoken. Keep it inside the central view:
// Meta VR Glasses have a much narrower field of view than Quest 3.

using System.Collections;
using System.Collections.Generic;
using Alibi.Core;
using TMPro;
using UnityEngine;

namespace Alibi
{
    public class CaptionPanel : MonoBehaviour
    {
        public TMP_Text speakerText;
        public TMP_Text lineText;
        [Tooltip("Short feedback such as a herring's rebuttal.")]
        public TMP_Text hintText;

        [Header("Word rails")]
        public Transform railsRoot;
        public WordChip chipPrefab;
        [Tooltip("A small text object copied for each rail's name tag.")]
        public TMP_Text railLabelTemplate;
        public float railSpacing = 0.07f;
        public float chipGap = 0.02f;
        [Tooltip("Rough chip width per character, in meters.")]
        public float metersPerChar = 0.011f;
        public float labelWidth = 0.12f;

        [Header("Look")]
        public string highlightOpen = "<color=#ff6b5e><u>";
        public string highlightClose = "</u></color>";

        private class Rail
        {
            public Transform Root;
            public Transform NameTag;
            public float NextX;
        }

        private readonly Dictionary<string, Rail> _rails = new Dictionary<string, Rail>();
        private Coroutine _hintRoutine;

        private void Awake()
        {
            if (railLabelTemplate != null) railLabelTemplate.gameObject.SetActive(false);
            if (hintText != null) hintText.text = "";
        }

        public void ShowNarration(string text)
        {
            if (speakerText != null) speakerText.text = "";
            if (lineText != null) lineText.text = $"<i>{text}</i>";
        }

        public void ShowSpeech(string speaker, string text)
        {
            if (speakerText != null) speakerText.text = speaker;
            if (lineText != null) lineText.text = text;
        }

        public void ShowLine(Suspect suspect, CaptionLine line) =>
            ShowSpeech(suspect.name, CaptionTiming.Highlight(line, highlightOpen, highlightClose));

        public void ShowHint(string text, float seconds)
        {
            if (hintText == null) return;
            if (_hintRoutine != null) StopCoroutine(_hintRoutine);
            _hintRoutine = StartCoroutine(HintRoutine(text, seconds));
        }

        /// <summary>Where red strings start for this suspect's words.</summary>
        public Transform RailAnchor(string suspectId) =>
            _rails.TryGetValue(suspectId, out var rail) ? rail.NameTag : railsRoot;

        /// <summary>Add a grabbable word to the suspect's rail as it is spoken.</summary>
        public WordChip AddChip(CaseDirector director, Suspect suspect, CaptionWord word)
        {
            var rail = GetRail(suspect);
            float width = word.text.Length * metersPerChar + chipGap;
            var slot = new GameObject($"slot {word.text}").transform;
            slot.SetParent(rail.Root, false);
            slot.localPosition = new Vector3(rail.NextX + width / 2f, 0f, 0f);
            rail.NextX += width + chipGap;

            var chip = Instantiate(chipPrefab, slot.position, slot.rotation);
            chip.Init(director, word, suspect.id, slot);
            return chip;
        }

        private Rail GetRail(Suspect suspect)
        {
            if (_rails.TryGetValue(suspect.id, out var rail)) return rail;

            var root = new GameObject($"Rail {suspect.name}").transform;
            root.SetParent(railsRoot, false);
            root.localPosition = new Vector3(0f, -_rails.Count * railSpacing, 0f);

            Transform tag = root;
            if (railLabelTemplate != null)
            {
                var label = Instantiate(railLabelTemplate, root);
                label.gameObject.SetActive(true);
                label.text = suspect.name;
                label.transform.localPosition = Vector3.zero;
                tag = label.transform;
            }
            rail = new Rail { Root = root, NameTag = tag, NextX = labelWidth };
            _rails[suspect.id] = rail;
            return rail;
        }

        private IEnumerator HintRoutine(string text, float seconds)
        {
            hintText.text = text;
            yield return new WaitForSeconds(seconds);
            hintText.text = "";
        }
    }
}
