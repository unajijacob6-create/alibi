import { test } from "node:test";
import assert from "node:assert/strict";
import { planCase } from "../src/planner.ts";
import { assembleCase } from "../src/assemble.ts";
import { solveCase } from "../src/solver.ts";
import { writeTemplateDraft } from "../src/writer-template.ts";
import { generateCase } from "../src/generate.ts";
import { normalize, pinTargets } from "../src/tokens.ts";
import type { CaseDraft, CaseFile, CasePlan, RoomObject } from "../src/types.ts";
import type { DraftWriter } from "../src/writer-llm.ts";
import { allRooms, bareRoom, bedroom } from "./fixtures.ts";

const templateCase = (room: RoomObject[], seed: number) => {
  const plan = planCase(room, { seed });
  return { plan, caseFile: assembleCase(plan, writeTemplateDraft(plan), room, "template") };
};

test("the same seed gives the same plan", () => {
  assert.deepEqual(planCase(bedroom, { seed: 7 }), planCase(bedroom, { seed: 7 }));
});

test("plan picks three lie words on three different visible objects", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const plan = planCase(bedroom, { seed });
    const ids = plan.lies.map((l) => l.objectId);
    assert.equal(new Set(ids).size, 3);
    assert.ok(!ids.includes("book2"), "book2 is not visible from the seat");
    assert.equal(plan.suspects.filter((s) => s.isLiar).length, 1);
  }
});

test("a bare room gets props so a case is still possible", () => {
  const plan = planCase(bareRoom, { seed: 3 });
  assert.equal(plan.lies.length, 3);
  assert.ok(plan.props.length >= 3, "EXIT is too common to be a lie, so all three are props");
  assert.ok(plan.props.every((p) => p.prop && p.visibleFromSeat));
});

test("herrings never pin to anything in the room", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const plan = planCase(bedroom, { seed });
    const room = [...bedroom, ...plan.props];
    for (const h of plan.herrings) assert.deepEqual(pinTargets(h.word, room), []);
  }
});

test("template cases pass the solver for every room and 200 seeds", () => {
  for (const [name, room] of Object.entries(allRooms)) {
    for (let seed = 1; seed <= 200; seed++) {
      const { caseFile } = templateCase(room, seed);
      const result = solveCase(caseFile, room);
      assert.ok(result.ok, `${name} seed ${seed}: ${result.errors.join("; ")}`);
    }
  }
});

test("the liar's pins are exactly the planned lies", () => {
  const { plan, caseFile } = templateCase(bedroom, 11);
  const pinned = caseFile.pins.map((p) => p.objectId).sort();
  assert.deepEqual(pinned, plan.lies.map((l) => l.objectId).sort());
  assert.equal(caseFile.glances.length, 3);
});

// --- The solver must reject broken cases -----------------------------------

const mutate = (fn: (c: CaseFile) => void): CaseFile => {
  const { caseFile } = templateCase(bedroom, 5);
  const copy = structuredClone(caseFile);
  fn(copy);
  return copy;
};
const liar = (c: CaseFile) => c.suspects.find((s) => s.isLiar)!;
const innocent = (c: CaseFile) => c.suspects.find((s) => !s.isLiar)!;
const rejects = (c: CaseFile, pattern: RegExp) => {
  const r = solveCase(c, bedroom);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => pattern.test(e)), `expected ${pattern}, got: ${r.errors.join("; ")}`);
};

test("solver rejects an innocent who says a room word unmarked", () => {
  rejects(
    mutate((c) => {
      innocent(c).lines[0]!.text = "I was drinking from a Kobayashi cup.";
    }),
    /without marking it/,
  );
});

test("solver rejects a liar with only two pins", () => {
  rejects(
    mutate((c) => {
      const l = liar(c);
      const line = l.lines.find((x) => x.words.length)!;
      const w = line.words[0]!;
      c.pins = c.pins.filter((p) => p.wordId !== w.wordId);
      c.glances = c.glances.filter((g) => g.wordId !== w.wordId);
      line.text = "I went for a walk.";
      line.words = [];
    }),
    /3 pinnable words/,
  );
});

test("solver rejects a lie that points at an object hidden from the seat", () => {
  rejects(
    mutate((c) => {
      const line = liar(c).lines.find((x) => x.words.length)!;
      const w = line.words[0]!;
      const text = `I read [[Moby]] twice.`.replace(/\[\[|\]\]/g, "");
      line.text = text;
      w.text = "Moby";
      w.start = text.indexOf("Moby");
      w.end = w.start + 4;
      const pin = c.pins.find((p) => p.wordId === w.wordId)!;
      pin.objectId = "book2";
      c.glances.find((g) => g.wordId === w.wordId)!.objectId = "book2";
    }),
    /not visible from the seat/,
  );
});

test("solver rejects two liars", () => {
  rejects(mutate((c) => (innocent(c).isLiar = true)), /exactly 1 liar/);
});

test("solver rejects a suspect name that is also a room word", () => {
  rejects(mutate((c) => (c.suspects[0]!.name = "Dorian Vane")), /also appears in the room/);
});

test("solver rejects a wrong answer key", () => {
  // The lamp has no printed text, so it can never be the right answer.
  rejects(mutate((c) => (c.pins[0]!.objectId = "lamp")), /do not match the solved pins/);
});

// --- Generator: Claude first, template as the safety net --------------------

class FakeWriter implements DraftWriter {
  readonly name = "llm" as const;
  calls: string[][] = [];
  private readonly drafts: ((plan: CasePlan) => CaseDraft)[];
  constructor(drafts: ((plan: CasePlan) => CaseDraft)[]) {
    this.drafts = drafts;
  }
  async write(plan: CasePlan, previousErrors: string[]) {
    this.calls.push(previousErrors);
    const next = this.drafts.shift();
    if (!next) throw new Error("no more drafts");
    return next(plan);
  }
}

/** A plausible good draft, written the way Claude is asked to. */
const goodDraft = (plan: CasePlan): CaseDraft => ({
  intro: [`${plan.victim.name} was found at ${plan.timeOfDeath}.`, "Three visitors. One liar."],
  suspects: plan.suspects.map((s) => ({
    id: s.id,
    lines: s.isLiar
      ? [
          "I was out all evening, detective.",
          `Started at the [[${s.requiredWords[0]}]] lounge.`,
          `Then a drink with [[${s.requiredWords[1]}]], an old pal.`,
          `Ended up watching [[${s.requiredWords[2]}]] at the pictures.`,
        ]
      : ["I stayed home.", `Just me and the [[${s.requiredWords[0]}]].`, "Ask anyone."],
  })),
  confession: "Alright. I was making it up as I went.",
});

test("a good Claude draft is used as is", async () => {
  const writer = new FakeWriter([goodDraft]);
  const report = await generateCase(bedroom, { seed: 9, writer });
  assert.equal(report.caseFile.writer, "llm");
  assert.equal(report.attempts.length, 1);
});

test("a bad draft gets the solver's errors back, and the rewrite is used", async () => {
  const leaky = (plan: CasePlan) => {
    const d = goodDraft(plan);
    d.intro.push("The mug said Kobayashi on it."); // leaks a room word
    return d;
  };
  const writer = new FakeWriter([leaky, goodDraft]);
  const report = await generateCase(bedroom, { seed: 9, writer });
  assert.equal(report.caseFile.writer, "llm");
  assert.equal(writer.calls.length, 2);
  assert.ok(writer.calls[1]!.some((e) => /intro line 3 mentions room word/.test(e)));
});

test("two bad drafts fall back to the template writer", async () => {
  const unmarked = (plan: CasePlan) => {
    const d = goodDraft(plan);
    d.suspects = d.suspects.map((s) => ({ ...s, lines: s.lines.map((l) => l.replace(/\[\[|\]\]/g, "")) }));
    return d;
  };
  const writer = new FakeWriter([unmarked, unmarked]);
  const report = await generateCase(bedroom, { seed: 9, writer });
  assert.equal(report.caseFile.writer, "template");
  assert.equal(report.attempts.at(-1)!.ok, true);
});

test("a network error falls straight back to the template writer", async () => {
  const writer = new FakeWriter([]);
  const report = await generateCase(bedroom, { seed: 9, writer });
  assert.equal(report.caseFile.writer, "template");
  assert.equal(writer.calls.length, 1, "no point retrying a dead connection");
});

test("innocent herrings carry the rebuttal and the tempting object", () => {
  const { caseFile, plan } = templateCase(bedroom, 21);
  assert.equal(caseFile.herrings.length, 2);
  for (const h of caseFile.herrings) {
    const planned = plan.herrings.find((p) => p.nearObjectId === h.nearObjectId);
    assert.ok(planned && h.rebuttal.length > 0);
  }
  const herringWords = caseFile.suspects
    .flatMap((s) => s.lines.flatMap((l) => l.words))
    .filter((w) => caseFile.herrings.some((h) => h.wordId === w.wordId))
    .map((w) => normalize(w.text));
  assert.equal(new Set(herringWords).size, 2);
});
