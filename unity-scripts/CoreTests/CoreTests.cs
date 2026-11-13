using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using Alibi.Core;
using Xunit;

public class CoreTests
{
    // Unity's JsonUtility reads public fields by exact name; System.Text.Json with
    // IncludeFields does the same, so this proves the C# types match the server's JSON.
    private static readonly JsonSerializerOptions Json = new JsonSerializerOptions { IncludeFields = true };

    private static CaseResponse Load(string name) =>
        JsonSerializer.Deserialize<CaseResponse>(
            File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "fixtures", name)), Json);

    private static CaptionWord WordWithText(CaseFile c, string text) =>
        c.suspects.SelectMany(s => s.lines).SelectMany(l => l.words).First(w => w.text == text);

    [Fact]
    public void ServerJsonFillsEveryField()
    {
        var c = Load("case-bedroom.json").caseFile;
        Assert.Equal(1, c.version);
        Assert.Equal(3, c.suspects.Length);
        Assert.Single(c.suspects, s => s.isLiar);
        Assert.Equal(3, c.pins.Length);
        Assert.Equal(2, c.herrings.Length);
        Assert.Equal(3, c.glances.Length);
        Assert.False(string.IsNullOrEmpty(c.confession));
        Assert.All(c.pins, p => Assert.False(string.IsNullOrEmpty(p.label)));
        foreach (var line in c.suspects.SelectMany(s => s.lines))
            foreach (var w in line.words)
                Assert.Equal(w.text, line.text.Substring(w.start, w.end - w.start));
    }

    [Fact]
    public void PropsArriveForABareRoom()
    {
        var c = Load("case-bare-room.json").caseFile;
        Assert.Equal(3, c.props.Length);
        Assert.All(c.props, p => Assert.True(p.prop && p.visibleFromSeat));
    }

    [Fact]
    public void ThreeCorrectPinsSolveTheCase()
    {
        var c = Load("case-bedroom.json").caseFile;
        var state = new CaseState(c);
        Assert.Equal(3, state.PinsNeeded);
        for (int i = 0; i < c.pins.Length; i++)
        {
            var r = state.TryPin(c.pins[i].wordId, c.pins[i].objectId);
            Assert.Equal(PinOutcome.Correct, r.Outcome);
            Assert.Equal(c.pins[i].label, r.Message);
            Assert.Equal(i == c.pins.Length - 1, r.SolvedNow);
        }
        Assert.True(state.IsSolved);
        Assert.Equal(0, state.Mistakes);
        Assert.Equal(PinOutcome.CaseClosed, state.TryPin(c.pins[0].wordId, c.pins[0].objectId).Outcome);
    }

    [Fact]
    public void WrongObjectAndHerringsCountAsMistakes()
    {
        var c = Load("case-bedroom.json").caseFile;
        var state = new CaseState(c);
        var lie = c.pins[0];
        var other = c.pins.First(p => p.objectId != lie.objectId).objectId;

        Assert.Equal(PinOutcome.WrongObject, state.TryPin(lie.wordId, other).Outcome);
        var herring = c.herrings[0];
        var r = state.TryPin(herring.wordId, "anything");
        Assert.Equal(PinOutcome.Herring, r.Outcome);
        Assert.Equal(herring.rebuttal, r.Message);
        Assert.Equal(2, state.Mistakes);

        Assert.Equal(PinOutcome.Correct, state.TryPin(lie.wordId, lie.objectId).Outcome);
        Assert.Equal(PinOutcome.AlreadyPinned, state.TryPin(lie.wordId, lie.objectId).Outcome);
        Assert.Equal(PinOutcome.UnknownWord, state.TryPin("nope", lie.objectId).Outcome);
    }

    [Fact]
    public void LookupsFindWordsAndTheirSpeaker()
    {
        var c = Load("case-bedroom.json").caseFile;
        var state = new CaseState(c);
        var w = WordWithText(c, "Kobayashi");
        Assert.True(state.SuspectOf(w.wordId).isLiar);
        Assert.Equal("mug", state.CorrectObjectFor(w.wordId));
        Assert.Same(state.Liar, state.SuspectOf(w.wordId));
    }

    [Fact]
    public void GlancesComeJustBeforeTheirWord()
    {
        var c = Load("case-bedroom.json").caseFile;
        var liar = c.suspects.First(s => s.isLiar);
        foreach (var line in liar.lines.Where(l => l.words.Length > 0))
        {
            float secs = CaptionTiming.EstimateSpeechSeconds(line.text);
            var words = CaptionTiming.WordCues(line, secs);
            var glances = CaptionTiming.GlanceCues(line, c.glances, secs);
            Assert.Equal(words.Count, glances.Count);
            for (int i = 0; i < words.Count; i++)
            {
                Assert.True(glances[i].Time <= words[i].Time);
                Assert.True(glances[i].Time >= 0f);
                Assert.True(words[i].Time <= secs);
            }
        }
    }

    [Fact]
    public void TimingHelpers()
    {
        Assert.Equal(4, CaptionTiming.CountWords("I don't know, detective."));
        Assert.Equal(CaptionTiming.MinLineSeconds, CaptionTiming.EstimateSpeechSeconds("No."));
        Assert.Equal(0f, CaptionTiming.TimeAtChar("", 3, 2f));
        Assert.Equal(1f, CaptionTiming.TimeAtChar("abcd", 2, 2f), 3);
    }

    [Fact]
    public void HighlightWrapsOnlyTheMarkedWords()
    {
        var line = new CaptionLine
        {
            text = "Ask Dorian at the Kobayashi bar.",
            words = new[]
            {
                new CaptionWord { wordId = "a", text = "Dorian", start = 4, end = 10 },
                new CaptionWord { wordId = "b", text = "Kobayashi", start = 18, end = 27 },
            },
        };
        Assert.Equal("Ask <u>Dorian</u> at the <u>Kobayashi</u> bar.", CaptionTiming.Highlight(line, "<u>", "</u>"));
    }
}
