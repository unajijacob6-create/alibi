import { test } from "node:test";
import assert from "node:assert/strict";
import { lieCandidates, normalize, pinTargets, roomIndex, speakable } from "../src/tokens.ts";
import { parseLine } from "../src/markers.ts";
import { bedroom, office } from "./fixtures.ts";

test("normalize strips case, accents and punctuation", () => {
  assert.equal(normalize("Kobayashi!"), "kobayashi");
  assert.equal(normalize("Café"), "cafe");
  assert.equal(normalize("World's"), "worlds");
});

test("speakable turns shouting caps into a name", () => {
  assert.equal(speakable("KOBAYASHI"), "Kobayashi");
  assert.equal(speakable("iPhone"), "iPhone");
});

test("room index skips stopwords and short words", () => {
  const index = roomIndex(bedroom);
  assert.ok(index.has("kobayashi"));
  assert.ok(index.has("dorian"));
  assert.ok(!index.has("the"));
  assert.ok(!index.has("of"));
});

test("pinTargets finds the object a word came from", () => {
  assert.deepEqual(pinTargets("Kobayashi", bedroom).map((o) => o.id), ["mug"]);
  assert.deepEqual(pinTargets("coffee", bedroom), []);
});

test("lie candidates are unique, visible, uncommon words", () => {
  const c = lieCandidates(office);
  const words = c.map((x) => normalize(x.word));
  assert.ok(!words.includes("quarterly"), "a word on two binders points at two objects");
  assert.ok(!words.includes("best"), "everyday words are skipped");
  for (const x of lieCandidates(bedroom)) assert.notEqual(x.objectId, "book2");
});

test("parseLine extracts marked words and positions", () => {
  const p = parseLine("I was at the [[Kobayashi]] café, ask [[Dorian]].");
  assert.equal(p.text, "I was at the Kobayashi café, ask Dorian.");
  assert.deepEqual(p.marks.map((m) => p.text.slice(m.start, m.end)), ["Kobayashi", "Dorian"]);
  assert.deepEqual(p.errors, []);
});

test("parseLine rejects multi-word and unclosed markers", () => {
  assert.ok(parseLine("[[two words]]").errors.length > 0);
  assert.ok(parseLine("oops [[open").errors.length > 0);
});

test("names and brands beat ordinary words as lies", () => {
  const room = [
    { id: "b", label: "book", text: ["The Picture of Dorian Gray"], visibleFromSeat: true, confidence: 0.9 },
  ];
  assert.equal(lieCandidates(room)[0]!.word, "Dorian");
});

test("the scan's suggested clue word wins when it is valid", () => {
  const room = [
    { id: "p", label: "poster", text: ["Monterey Jazz Festival"], clueWord: "Festival", visibleFromSeat: true, confidence: 0.9 },
  ];
  assert.equal(lieCandidates(room)[0]!.word, "Festival");
  room[0]!.clueWord = "Nonexistent";
  assert.equal(lieCandidates(room)[0]!.word, "Monterey", "an invalid suggestion is ignored");
});
