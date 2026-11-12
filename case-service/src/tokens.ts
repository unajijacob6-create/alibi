// Word rules shared by the planner, the writers and the solver.
// The solver relies only on these functions, never on the planner's choices,
// so it checks every case independently.

import type { RoomObject } from "./types.ts";

const STOPWORDS = new Set(
  `a an and are as at be but by for from has have he her his i in is it its me my
  no not of on or our she so that the their them they this to was we were what when
  who will with you your all any can did do does had how if into just more most new
  one out over than then there these those too two up very via vol ed edition
  inc ltd co`.split(/\s+/),
);

/** Everyday words that are poor lies even when printed on something. */
const COMMON = new Set(
  `about after again also always back best big book coffee come cup day design
  even every family first free friend friends fun good great happy have here home
  hope keep kind know life light like little live long look love made make man
  many much music never next nice night now old only open people place play real
  right say see show small some start still stop take tea thank thing think time
  today together true use want water way well work world year years
  exit push pull sale caution warning danger entrance welcome`.split(/\s+/),
);

/** Ordinary dictionary words: allowed as lies, but names and brands score higher. */
const ORDINARY = new Set(
  `picture story stories house garden city river night morning evening summer winter
  autumn spring street road black white blue green gold golden silver dark bright
  festival jazz rock blues classic classics collection history guide recipes kitchen
  crunchy oat oats clusters cereal original natural fresh organic premium special
  quarterly report reports budget visit travel journal notes notebook planner
  coffee roast blend tea chocolate honey milk sugar salt bread cake cookies
  man woman girl boy king queen prince princess lord lady war peace love heart
  secret secrets lost found island mountain ocean sea sky star stars moon sun
  fire ice stone glass paper wood iron steel art science nature wild little great
  grand royal national international club company records music band volume
  series part chapter book novel edition press magazine times daily weekly
  happy merry best world family home party`.split(/\s+/),
);

/** Lowercase, strip accents and punctuation: "Kobayashi!" -> "kobayashi". */
export function normalize(word: string): string {
  return word
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Find word-like runs in text, with their positions. */
export function findWords(text: string): { raw: string; start: number; end: number }[] {
  const out: { raw: string; start: number; end: number }[] = [];
  const re = /[\p{L}\p{N}]+/gu;
  for (const m of text.matchAll(re)) {
    out.push({ raw: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** Is this normalized word meaningful enough to count as a room word? */
function isIndexable(n: string): boolean {
  if (n.length < 3) return false;
  if (STOPWORDS.has(n)) return false;
  return true;
}

/** All room words printed on one object. */
export function objectTokens(obj: RoomObject): Set<string> {
  const set = new Set<string>();
  for (const t of obj.text) {
    for (const w of findWords(t)) {
      const n = normalize(w.raw);
      if (isIndexable(n)) set.add(n);
    }
  }
  return set;
}

/** Map each room word to the objects it is printed on. */
export function roomIndex(room: RoomObject[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const obj of room) {
    for (const t of objectTokens(obj)) {
      const ids = index.get(t) ?? [];
      ids.push(obj.id);
      index.set(t, ids);
    }
  }
  return index;
}

/** Objects a spoken word can be pinned to. Empty means it is not from the room. */
export function pinTargets(word: string, room: RoomObject[]): RoomObject[] {
  const n = normalize(word);
  if (!isIndexable(n)) return [];
  return room.filter((o) => objectTokens(o).has(n));
}

/** "KOBAYASHI" -> "Kobayashi"; "iPhone" stays "iPhone". */
export function speakable(raw: string): string {
  if (raw === raw.toUpperCase() && /[A-Z]/.test(raw)) {
    return raw.charAt(0) + raw.slice(1).toLowerCase();
  }
  return raw;
}

export interface LieCandidate {
  objectId: string;
  word: string;
  score: number;
  pinLabel: string;
}

/**
 * The best word each visible object can lend to a lie.
 * A good lie word is printed on exactly one object, is not an everyday word,
 * looks like a name or brand, and is easy to read.
 */
export function lieCandidates(room: RoomObject[]): LieCandidate[] {
  const index = roomIndex(room);
  const out: LieCandidate[] = [];
  for (const obj of room) {
    if (!obj.visibleFromSeat) continue;
    let best: LieCandidate | null = null;
    for (const t of obj.text) {
      for (const w of findWords(t)) {
        const n = normalize(w.raw);
        if (!isIndexable(n) || n.length < 4) continue;
        if (COMMON.has(n)) continue;
        if (/^\d+$/.test(n)) continue;
        if ((index.get(n) ?? []).length !== 1) continue;
        const looksProper = /^\p{Lu}/u.test(w.raw);
        // The scan names each object's most distinctive word; trust it first.
        const suggested = obj.clueWord !== undefined && normalize(obj.clueWord) === n;
        const score =
          Math.min(n.length, 9) +
          (looksProper ? 4 : 0) +
          (ORDINARY.has(n) ? -8 : 0) +
          (suggested ? 20 : 0) +
          obj.confidence * 5;
        if (!best || score > best.score) {
          best = {
            objectId: obj.id,
            word: speakable(w.raw),
            score,
            pinLabel: `${w.raw.toUpperCase()}, printed on the ${obj.label}`,
          };
        }
      }
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.score - a.score);
}
