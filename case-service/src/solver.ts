// Prove a case is fair before the player sees it.
//
// The solver works only from the finished CaseFile and the room, using the
// same word rules the headset uses for pinning. It does not trust the planner
// or the writer. A case passes only when:
//   - exactly one suspect (the liar) has words that pin to the room,
//   - the liar has exactly three, on three different objects, all visible from the seat,
//   - every innocent has a tempting word that pins to nothing,
//   - no room word appears anywhere unmarked (so nothing is ungrabbable or accidental),
//   - the pins, herrings and glances in the file match what the solver derives.

import type { CaseFile, RoomObject, SolveResult } from "./types.ts";
import { findWords, normalize, pinTargets, roomIndex } from "./tokens.ts";

export const LIMITS = {
  suspects: 3,
  pinsNeeded: 3,
  minLines: 2,
  maxLines: 5,
  maxWordsPerLine: 40,
  maxIntroLines: 4,
};

export function solveCase(c: CaseFile, room: RoomObject[]): SolveResult {
  const errors: string[] = [];
  const fullRoom = [...room, ...c.props];
  const index = roomIndex(fullRoom);
  const isRoomWord = (w: string) => index.has(normalize(w));
  const byId = new Map(fullRoom.map((o) => [o.id, o]));

  // Structure
  if (c.suspects.length !== LIMITS.suspects) {
    errors.push(`expected ${LIMITS.suspects} suspects, got ${c.suspects.length}`);
  }
  const liars = c.suspects.filter((s) => s.isLiar);
  if (liars.length !== 1) errors.push(`expected exactly 1 liar, got ${liars.length}`);
  if (new Set(c.suspects.map((s) => s.id)).size !== c.suspects.length) {
    errors.push("suspect ids are not unique");
  }
  if (c.intro.length < 1 || c.intro.length > LIMITS.maxIntroLines) {
    errors.push(`intro must have 1-${LIMITS.maxIntroLines} lines`);
  }

  // Names must not collide with room words, or a name could be "pinned".
  const nameWords = [c.victim.name, ...c.suspects.map((s) => s.name)].flatMap((n) =>
    findWords(n).map((w) => w.raw),
  );
  for (const w of nameWords) {
    if (isRoomWord(w)) errors.push(`name word "${w}" also appears in the room`);
  }

  // Narration and the confession must not mention room words.
  for (const [where, text] of [
    ...c.intro.map((t, i) => [`intro line ${i + 1}`, t] as const),
    ["confession", c.confession] as const,
  ]) {
    for (const w of findWords(text)) {
      if (isRoomWord(w.raw)) errors.push(`${where} mentions room word "${w.raw}"`);
    }
  }

  // Lines: every room word must be marked; derive pins per suspect.
  const derivedPins: { wordId: string; objectId: string }[] = [];
  const derivedHerrings = new Set<string>();
  const wordIds = new Set<string>();

  for (const s of c.suspects) {
    if (s.lines.length < LIMITS.minLines || s.lines.length > LIMITS.maxLines) {
      errors.push(`${s.id} must have ${LIMITS.minLines}-${LIMITS.maxLines} lines, got ${s.lines.length}`);
    }
    const seen = new Map<string, number>();
    let pinnable = 0;
    let unpinnable = 0;
    for (const line of s.lines) {
      const count = findWords(line.text).length;
      if (count === 0) errors.push(`${s.id} has an empty line`);
      if (count > LIMITS.maxWordsPerLine) {
        errors.push(`${s.id} line "${line.id}" is too long (${count} words)`);
      }
      for (const w of line.words) {
        if (wordIds.has(w.wordId)) errors.push(`duplicate word id ${w.wordId}`);
        wordIds.add(w.wordId);
        if (line.text.slice(w.start, w.end) !== w.text) {
          errors.push(`word ${w.wordId} position does not match its text`);
        }
      }
      // Any room word outside a marked word is a leak.
      for (const tok of findWords(line.text)) {
        if (!isRoomWord(tok.raw)) continue;
        const marked = line.words.some((w) => tok.start >= w.start && tok.end <= w.end);
        if (!marked) errors.push(`${s.id} says room word "${tok.raw}" without marking it`);
      }
      for (const w of line.words) {
        const n = normalize(w.text);
        seen.set(n, (seen.get(n) ?? 0) + 1);
        const targets = pinTargets(w.text, fullRoom);
        if (targets.length === 0) {
          unpinnable++;
          if (!s.isLiar) derivedHerrings.add(w.wordId);
          else errors.push(`liar marks "${w.text}", which pins to nothing`);
          continue;
        }
        pinnable++;
        if (!s.isLiar) {
          errors.push(`innocent ${s.id} says room word "${w.text}"`);
          continue;
        }
        if (targets.length > 1) {
          errors.push(`"${w.text}" is printed on ${targets.length} objects; a lie must point at one`);
          continue;
        }
        const target = targets[0]!;
        if (!target.visibleFromSeat) {
          errors.push(`"${w.text}" points at ${target.id}, which is not visible from the seat`);
        }
        derivedPins.push({ wordId: w.wordId, objectId: target.id });
      }
    }
    for (const [n, k] of seen) {
      if (k > 1) errors.push(`${s.id} marks "${n}" ${k} times; each word must appear once`);
    }
    if (s.isLiar) {
      if (pinnable !== LIMITS.pinsNeeded) {
        errors.push(`liar must have ${LIMITS.pinsNeeded} pinnable words, has ${pinnable}`);
      }
      const objects = new Set(derivedPins.map((p) => p.objectId));
      if (objects.size !== derivedPins.length) {
        errors.push("two of the liar's words point at the same object");
      }
    } else if (unpinnable < 1) {
      errors.push(`innocent ${s.id} needs at least one tempting word`);
    }
  }

  // The file's answer key must match what the solver derived.
  const key = (p: { wordId: string; objectId: string }) => `${p.wordId}->${p.objectId}`;
  const filePins = new Set(c.pins.map(key));
  const solved = new Set(derivedPins.map(key));
  if (filePins.size !== solved.size || [...solved].some((k) => !filePins.has(k))) {
    errors.push("pins in the case file do not match the solved pins");
  }
  for (const p of c.pins) {
    if (!byId.has(p.objectId)) errors.push(`pin points at unknown object ${p.objectId}`);
  }
  const fileHerrings = new Set(c.herrings.map((h) => h.wordId));
  if (fileHerrings.size !== derivedHerrings.size || [...derivedHerrings].some((h) => !fileHerrings.has(h))) {
    errors.push("herrings in the case file do not match the solved herrings");
  }
  const glanced = new Set(c.glances.map(key));
  if (glanced.size !== solved.size || [...solved].some((k) => !glanced.has(k))) {
    errors.push("every pin needs exactly one matching glance");
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}
