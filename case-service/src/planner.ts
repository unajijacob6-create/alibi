// Decide the logic of a case in code. The AI writer only adds dialogue on top,
// so a case can never be unsolvable because the AI got the logic wrong.

import type { CasePlan, Herring, LieWord, PlannedSuspect, RoomObject } from "./types.ts";
import { lieCandidates, normalize, roomIndex } from "./tokens.ts";

/** Small fast seeded RNG so the same seed always gives the same case. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, items: readonly T[]): T {
  return items[Math.floor(r() * items.length)]!;
}

export function shuffle<T>(r: () => number, items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const FIRST = [
  "Vera", "Otis", "Margo", "Felix", "Ida", "Jasper", "Lena", "Rufus", "Nell",
  "Cyril", "Opal", "Hugo", "Thea", "Silas", "June", "Desmond", "Mabel", "Ezra",
];
const LAST = [
  "Quill", "Hartsell", "Vane", "Cobb", "Linden", "Marsh", "Pell", "Dunmore",
  "Voss", "Ashby", "Crane", "Ferrow", "Lockhart", "Tamsin", "Brook", "Wilde",
];
const RELATIONS = [
  "the victim's business partner",
  "the neighbour from downstairs",
  "an old flame",
  "the victim's younger brother",
  "the night-shift doorman",
  "a debt collector",
  "the victim's oldest friend",
  "the landlord",
];
const VICTIMS = [
  { name: "Arthur Penhale", occupation: "a retired jeweller" },
  { name: "Delphine Moss", occupation: "a radio host" },
  { name: "Gideon Shaw", occupation: "a pawnbroker" },
  { name: "Rosalind Kerr", occupation: "a piano teacher" },
  { name: "Mortimer Bly", occupation: "a racehorse owner" },
];
const TIMES = ["9:40 pm", "10:15 pm", "11:05 pm", "11:50 pm", "12:20 am"];

/** Props the narrator drops on the table when the room has too few clues. */
const PROPS: { label: string; text: string; word: string }[] = [
  { label: "matchbook", text: "THE VESPERTINE CLUB", word: "Vespertine" },
  { label: "photograph", text: "Greetings from Port Halloran", word: "Halloran" },
  { label: "theatre ticket", text: "ORPHEUM, ROW F", word: "Orpheum" },
  { label: "napkin", text: "Café Lisbonne", word: "Lisbonne" },
  { label: "luggage tag", text: "SS Calliope", word: "Calliope" },
];

/** Tempting everyday words, keyed by what the object is. */
const HERRING_BY_LABEL: [RegExp, string[]][] = [
  [/mug|cup|kettle/, ["coffee", "tea"]],
  [/umbrella|coat|jacket/, ["rain", "storm"]],
  [/book|shelf|novel/, ["novel", "library"]],
  [/lamp|light|candle/, ["lamplight", "candles"]],
  [/plant|flower|vase/, ["garden", "flowers"]],
  [/guitar|piano|speaker|record|headphone/, ["music", "records"]],
  [/clock|watch/, ["midnight", "clock"]],
  [/bottle|glass|wine/, ["wine", "whisky"]],
  [/phone|laptop|computer|screen|tv|television/, ["phone", "television"]],
  [/shoe|boot/, ["shoes", "walking"]],
  [/bag|backpack|case/, ["luggage", "suitcase"]],
];
const GENERIC_HERRINGS = ["rain", "taxi", "midnight", "radio", "trains", "fog"];

export interface PlanOptions {
  seed: number;
  /** Objects with lower scan confidence are never used as clues. */
  minConfidence?: number;
}

export function planCase(room: RoomObject[], opts: PlanOptions): CasePlan {
  const r = rng(opts.seed);
  const minConfidence = opts.minConfidence ?? 0.6;

  // 1. Pick three lie words, from three different objects, all visible from the seat.
  const reliable = room.filter((o) => o.confidence >= minConfidence);
  const candidates = lieCandidates(reliable);
  // Vary cases between nights, but only among words nearly as good as the
  // top three, so a strong name never loses to "Clusters" on a cereal box.
  const cutoff = (candidates[2]?.score ?? -Infinity) - 3;
  const strong = candidates.filter((c) => c.score >= cutoff);
  const chosen = shuffle(r, strong).slice(0, 3);

  const props: RoomObject[] = [];
  const usedIndex = roomIndex(room);
  for (const p of shuffle(r, PROPS)) {
    if (chosen.length >= 3) break;
    if (usedIndex.has(normalize(p.word))) continue;
    const prop: RoomObject = {
      id: `prop-${props.length + 1}`,
      label: p.label,
      text: [p.text],
      visibleFromSeat: true,
      confidence: 1,
      prop: true,
    };
    props.push(prop);
    chosen.push({
      objectId: prop.id,
      word: p.word,
      score: 0,
      pinLabel: `${p.word.toUpperCase()}, printed on the ${p.label}`,
    });
  }
  if (chosen.length < 3) {
    throw new Error("could not find or place three clue objects");
  }

  const fullRoom = [...room, ...props];
  const index = roomIndex(fullRoom);
  const isRoomWord = (w: string) => index.has(normalize(w));

  const lies: LieWord[] = chosen.map((c) => ({
    word: c.word,
    objectId: c.objectId,
    pinLabel: c.pinLabel,
  }));

  // 2. Cast three suspects whose names share no word with the room.
  const names = shuffle(r, FIRST)
    .flatMap((f) => shuffle(r, LAST).map((l) => `${f} ${l}`))
    .filter((n) => !n.split(" ").some(isRoomWord));
  const uniqueNames: string[] = [];
  for (const n of names) {
    const [f, l] = n.split(" ");
    if (uniqueNames.some((u) => u.startsWith(f + " ") || u.endsWith(" " + l))) continue;
    uniqueNames.push(n);
    if (uniqueNames.length === 3) break;
  }
  const relations = shuffle(r, RELATIONS);
  const liarIndex = Math.floor(r() * 3);

  const victims = VICTIMS.filter((v) => !v.name.split(" ").some(isRoomWord));
  const victim = pick(r, victims.length ? victims : VICTIMS);

  // 3. Give each innocent suspect one tempting word that is NOT from the room.
  const lieObjectIds = new Set(lies.map((l) => l.objectId));
  const herringObjects = shuffle(
    r,
    fullRoom.filter((o) => o.visibleFromSeat && !lieObjectIds.has(o.id) && !o.prop),
  );
  const usedWords = new Set(lies.map((l) => normalize(l.word)));
  const suspects: PlannedSuspect[] = [];
  const herrings: Herring[] = [];

  for (let i = 0; i < 3; i++) {
    const id = `suspect-${i + 1}`;
    const isLiar = i === liarIndex;
    const suspect: PlannedSuspect = {
      id,
      name: uniqueNames[i]!,
      relation: relations[i]!,
      isLiar,
      requiredWords: isLiar ? lies.map((l) => l.word) : [],
    };
    if (!isLiar) {
      const h = chooseHerring(r, herringObjects, isRoomWord, usedWords);
      usedWords.add(normalize(h.word));
      suspect.requiredWords = [h.word];
      herrings.push({ suspectId: id, ...h });
    }
    suspects.push(suspect);
  }

  // 4. Every other room word is off limits, so only the liar's story points at the room.
  const lieSet = new Set(lies.map((l) => normalize(l.word)));
  const forbiddenWords = [...index.keys()].filter((w) => !lieSet.has(w)).sort();

  return {
    seed: opts.seed,
    victim,
    timeOfDeath: pick(r, TIMES),
    suspects,
    lies,
    herrings,
    forbiddenWords,
    props,
  };
}

function chooseHerring(
  r: () => number,
  objects: RoomObject[],
  isRoomWord: (w: string) => boolean,
  used: Set<string>,
): Omit<Herring, "suspectId"> {
  const ok = (w: string) => !isRoomWord(w) && !used.has(normalize(w));
  for (const obj of objects) {
    for (const [re, words] of HERRING_BY_LABEL) {
      if (!re.test(obj.label.toLowerCase())) continue;
      const word = shuffle(r, words).find(ok);
      if (word) {
        objects.splice(objects.indexOf(obj), 1);
        return {
          word,
          nearObjectId: obj.id,
          rebuttal: `Everyone talks about ${word}. A liar borrows details only your room could give them.`,
        };
      }
    }
  }
  const word = shuffle(r, GENERIC_HERRINGS).find(ok) ?? "weather";
  return {
    word,
    nearObjectId: null,
    rebuttal: `Nothing in this room says "${word}". Listen for details that only your room could give them.`,
  };
}
