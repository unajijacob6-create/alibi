// The rules of play: what happens when the player drops a word on an object.
// Pure C#, no Unity, so it is unit-tested outside the engine.

using System;
using System.Collections.Generic;

namespace Alibi.Core
{
    public enum PinOutcome
    {
        /// <summary>The word came from this object. The string snaps tight.</summary>
        Correct,
        /// <summary>The word is a red herring: it pins to nothing. Show the rebuttal.</summary>
        Herring,
        /// <summary>A real lie word, but dropped on the wrong object.</summary>
        WrongObject,
        /// <summary>This word is already pinned.</summary>
        AlreadyPinned,
        /// <summary>The word id is not in this case (should not happen).</summary>
        UnknownWord,
        /// <summary>The case is already solved; pins no longer count.</summary>
        CaseClosed,
    }

    public readonly struct PinResult
    {
        public readonly PinOutcome Outcome;
        /// <summary>Text to show: the object label on success, the rebuttal for a herring.</summary>
        public readonly string Message;
        /// <summary>True when this pin was the last one needed.</summary>
        public readonly bool SolvedNow;

        public PinResult(PinOutcome outcome, string message, bool solvedNow = false)
        {
            Outcome = outcome;
            Message = message;
            SolvedNow = solvedNow;
        }
    }

    public class CaseState
    {
        public const string WrongObjectMessage = "The string falls slack. That word didn't come from there.";

        private readonly CaseFile _case;
        private readonly Dictionary<string, Pin> _pinByWord = new Dictionary<string, Pin>();
        private readonly Dictionary<string, HerringInfo> _herringByWord = new Dictionary<string, HerringInfo>();
        private readonly Dictionary<string, CaptionWord> _words = new Dictionary<string, CaptionWord>();
        private readonly Dictionary<string, Suspect> _suspectByWord = new Dictionary<string, Suspect>();
        private readonly HashSet<string> _pinned = new HashSet<string>();

        public CaseFile Case => _case;
        public int PinsNeeded => _pinByWord.Count;
        public int PinsMade => _pinned.Count;
        public int Mistakes { get; private set; }
        public bool IsSolved => PinsNeeded > 0 && PinsMade == PinsNeeded;

        public CaseState(CaseFile caseFile)
        {
            _case = caseFile ?? throw new ArgumentNullException(nameof(caseFile));
            foreach (var p in caseFile.pins ?? Array.Empty<Pin>()) _pinByWord[p.wordId] = p;
            foreach (var h in caseFile.herrings ?? Array.Empty<HerringInfo>()) _herringByWord[h.wordId] = h;
            foreach (var s in caseFile.suspects ?? Array.Empty<Suspect>())
            {
                foreach (var line in s.lines ?? Array.Empty<CaptionLine>())
                {
                    foreach (var w in line.words ?? Array.Empty<CaptionWord>())
                    {
                        _words[w.wordId] = w;
                        _suspectByWord[w.wordId] = s;
                    }
                }
            }
        }

        public Suspect Liar => Array.Find(_case.suspects ?? Array.Empty<Suspect>(), s => s.isLiar);

        public bool IsPinned(string wordId) => _pinned.Contains(wordId);

        public CaptionWord FindWord(string wordId) =>
            _words.TryGetValue(wordId, out var w) ? w : null;

        public Suspect SuspectOf(string wordId) =>
            _suspectByWord.TryGetValue(wordId, out var s) ? s : null;

        /// <summary>The object a word correctly pins to, or null.</summary>
        public string CorrectObjectFor(string wordId) =>
            _pinByWord.TryGetValue(wordId, out var p) ? p.objectId : null;

        /// <summary>Apply the player's drop of a word onto an object.</summary>
        public PinResult TryPin(string wordId, string objectId)
        {
            if (IsSolved) return new PinResult(PinOutcome.CaseClosed, "");
            if (!_words.ContainsKey(wordId)) return new PinResult(PinOutcome.UnknownWord, "");
            if (_pinned.Contains(wordId)) return new PinResult(PinOutcome.AlreadyPinned, "");

            if (_pinByWord.TryGetValue(wordId, out var pin))
            {
                if (pin.objectId == objectId)
                {
                    _pinned.Add(wordId);
                    return new PinResult(PinOutcome.Correct, pin.label, IsSolved);
                }
                Mistakes++;
                return new PinResult(PinOutcome.WrongObject, WrongObjectMessage);
            }

            Mistakes++;
            if (_herringByWord.TryGetValue(wordId, out var herring))
            {
                return new PinResult(PinOutcome.Herring, herring.rebuttal);
            }
            return new PinResult(PinOutcome.WrongObject, WrongObjectMessage);
        }
    }
}
