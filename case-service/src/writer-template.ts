// Offline writer: builds dialogue from line patterns, no AI and no network.
// Used when Claude is unavailable, slow, refuses, or writes something the
// solver rejects. Every pattern is checked against the room, so it never
// mentions a room word by accident.

import type { CaseDraft, CasePlan } from "./types.ts";
import { findWords, normalize } from "./tokens.ts";
import { rng, shuffle } from "./planner.ts";

const LIE_LINES = [
  "I spent the whole evening at the [[{word}]], from eight until they closed.",
  "I was with an old friend called [[{word}]]. Ask around, everyone knows us.",
  "The taxi dropped me outside [[{word}]] just before ten.",
  "I bought a ticket for [[{word}]] that evening. I kept the stub.",
  "We raised a glass to [[{word}]] around eleven. Half the bar saw me.",
  "I was reading about [[{word}]] in bed when the phone rang.",
];
const LIAR_OPENERS = [
  "Look, detective, I had nothing against {victim}.",
  "I'll tell you exactly where I was. Write it down.",
  "You've got the wrong person, and I can prove it.",
];
const HERRING_LINES = [
  // Written so any everyday noun fits: "rain", "candles", "coffee", "music".
  "All I remember from that evening is talk of [[{word}]].",
  "Honestly? I sat there thinking about [[{word}]], then fell asleep.",
  "We talked about [[{word}]] for a while, and then I went home.",
];
const INNOCENT_LINES = [
  "I barely knew {victim} these days.",
  "I was at home. Alone, I'm afraid.",
  "I had work in the morning, so I turned in early.",
  "Ask my sister. She called me twice that evening.",
  "I didn't hear a thing until the sirens.",
  "I'm telling you the truth, detective.",
  "We argued once, years ago. That's all.",
];
const INTRO_LINES = [
  "{victim}, {occupation}, was found dead at {time}.",
  "Three people saw the victim that evening. One of them is lying.",
  "Listen closely. A liar borrows details from whatever is in front of them.",
];
const CONFESSIONS = [
  "Fine. I made it all up. Every detail was sitting right there in front of me.",
  "You noticed. I needed a story fast, so I borrowed one from what I could see.",
  "All right. None of it happened. I just said whatever caught my eye.",
];

export function writeTemplateDraft(plan: CasePlan): CaseDraft {
  const r = rng(plan.seed ^ 0x9e3779b9);
  const forbidden = new Set(plan.forbiddenWords);
  const lieWords = new Set(plan.lies.map((l) => normalize(l.word)));

  // A line is safe when every room word in it is one of the liar's lie words.
  const safe = (line: string) =>
    findWords(line).every((w) => {
      const n = normalize(w.raw);
      return !forbidden.has(n) || lieWords.has(n);
    });

  const fill = (pattern: string, word = "") =>
    pattern
      .replaceAll("{victim}", plan.victim.name)
      .replaceAll("{occupation}", plan.victim.occupation)
      .replaceAll("{time}", plan.timeOfDeath)
      .replaceAll("{word}", word);

  /** First safe line from a shuffled pool; patterns already used are skipped. */
  const used = new Set<string>();
  const choose = (pool: string[], fallback: string, word?: string) => {
    for (const p of shuffle(r, pool)) {
      if (used.has(p)) continue;
      const line = fill(p, word);
      if (safe(line)) {
        used.add(p);
        return line;
      }
    }
    return fill(fallback, word);
  };

  const suspects = plan.suspects.map((s) => {
    if (s.isLiar) {
      const lines = [choose(LIAR_OPENERS, "I was not there.")];
      for (const word of s.requiredWords) {
        lines.push(choose(LIE_LINES, "[[{word}]].", word));
      }
      return { id: s.id, lines };
    }
    return {
      id: s.id,
      lines: [
        choose(INNOCENT_LINES, "I was not there."),
        choose(HERRING_LINES, "[[{word}]].", s.requiredWords[0]),
        choose(INNOCENT_LINES, "No."),
      ],
    };
  });

  const intro = INTRO_LINES.map((l) => fill(l)).filter(safe);
  return {
    intro: intro.length ? intro : ["One of them is lying."],
    suspects,
    confession: choose(CONFESSIONS, "Fine. I lied."),
  };
}
