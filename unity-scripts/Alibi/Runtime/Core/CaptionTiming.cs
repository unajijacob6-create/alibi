// When each grabbable word is spoken, and when the liar glances at its object.
// Until recorded voices with word timings exist, a line's duration is estimated
// from its length, and words are timed by their position in the text.

using System;
using System.Collections.Generic;

namespace Alibi.Core
{
    public sealed class WordCue
    {
        /// <summary>Seconds from the start of the line.</summary>
        public float Time;
        public CaptionWord Word;
    }

    public sealed class GlanceCue
    {
        /// <summary>Seconds from the start of the line; never negative.</summary>
        public float Time;
        public string ObjectId;
        public string WordId;
    }

    public static class CaptionTiming
    {
        /// <summary>Comfortable reading and speaking pace.</summary>
        public const float SecondsPerWord = 0.38f;
        /// <summary>Pause after each line.</summary>
        public const float LinePause = 0.6f;
        /// <summary>Shortest time a line stays up.</summary>
        public const float MinLineSeconds = 1.6f;

        public static int CountWords(string text)
        {
            if (string.IsNullOrEmpty(text)) return 0;
            int count = 0;
            bool inWord = false;
            foreach (var c in text)
            {
                bool wordChar = char.IsLetterOrDigit(c) || c == '\'' || c == '’';
                if (wordChar && !inWord) count++;
                inWord = wordChar;
            }
            return count;
        }

        /// <summary>Estimated time to say a line, excluding the pause after it.</summary>
        public static float EstimateSpeechSeconds(string text) =>
            Math.Max(MinLineSeconds, CountWords(text) * SecondsPerWord);

        /// <summary>When the character at charIndex is reached, assuming an even pace.</summary>
        public static float TimeAtChar(string text, int charIndex, float speechSeconds)
        {
            if (string.IsNullOrEmpty(text)) return 0f;
            float fraction = Math.Clamp(charIndex / (float)text.Length, 0f, 1f);
            return fraction * speechSeconds;
        }

        public static List<WordCue> WordCues(CaptionLine line, float speechSeconds)
        {
            var cues = new List<WordCue>();
            foreach (var w in line.words ?? Array.Empty<CaptionWord>())
            {
                cues.Add(new WordCue { Time = TimeAtChar(line.text, w.start, speechSeconds), Word = w });
            }
            cues.Sort((a, b) => a.Time.CompareTo(b.Time));
            return cues;
        }

        /// <summary>Glances for this line: each fires leadMs before its word is spoken.</summary>
        public static List<GlanceCue> GlanceCues(CaptionLine line, Glance[] glances, float speechSeconds)
        {
            var cues = new List<GlanceCue>();
            if (glances == null) return cues;
            foreach (var w in line.words ?? Array.Empty<CaptionWord>())
            {
                var g = Array.Find(glances, x => x.wordId == w.wordId);
                if (g == null) continue;
                float at = TimeAtChar(line.text, w.start, speechSeconds) - g.leadMs / 1000f;
                cues.Add(new GlanceCue { Time = Math.Max(0f, at), ObjectId = g.objectId, WordId = w.wordId });
            }
            cues.Sort((a, b) => a.Time.CompareTo(b.Time));
            return cues;
        }

        /// <summary>
        /// The line with grabbable words wrapped in rich-text tags for display.
        /// Positions come from the case file, so the text itself is never re-parsed.
        /// </summary>
        public static string Highlight(CaptionLine line, string openTag, string closeTag)
        {
            var text = line.text ?? "";
            var words = new List<CaptionWord>(line.words ?? Array.Empty<CaptionWord>());
            words.Sort((a, b) => b.start.CompareTo(a.start)); // insert from the end
            foreach (var w in words)
            {
                if (w.start < 0 || w.end > text.Length || w.start >= w.end) continue;
                text = text.Substring(0, w.end) + closeTag + text.Substring(w.end);
                text = text.Substring(0, w.start) + openTag + text.Substring(w.start);
            }
            return text;
        }
    }
}
