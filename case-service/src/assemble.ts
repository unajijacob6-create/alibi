// Turn a plan plus a writer's dialogue into the CaseFile the headset plays.

import type { CaseDraft, CaseFile, CasePlan, RoomObject } from "./types.ts";
import { parseLine } from "./markers.ts";
import { normalize, pinTargets } from "./tokens.ts";

/** How long before saying a lie word the liar glances at its object. */
export const GLANCE_LEAD_MS = 700;

export class DraftError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`draft has problems: ${problems.join("; ")}`);
    this.problems = problems;
  }
}

export function assembleCase(
  plan: CasePlan,
  draft: CaseDraft,
  room: RoomObject[],
  writer: CaseFile["writer"],
): CaseFile {
  const problems: string[] = [];
  const fullRoom = [...room, ...plan.props];
  const herringByWord = new Map(plan.herrings.map((h) => [normalize(h.word), h]));
  const lieLabel = new Map(plan.lies.map((l) => [normalize(l.word), l.pinLabel]));

  const pins: CaseFile["pins"] = [];
  const herrings: CaseFile["herrings"] = [];
  const glances: CaseFile["glances"] = [];

  const suspects = plan.suspects.map((ps) => {
    const ds = draft.suspects.find((d) => d.id === ps.id);
    if (!ds) {
      problems.push(`no lines for ${ps.id}`);
      return { ...ps, lines: [] };
    }
    let w = 0;
    const lines = ds.lines.map((raw, li) => {
      const parsed = parseLine(raw);
      problems.push(...parsed.errors.map((e) => `${ps.id}: ${e}`));
      const words = parsed.marks.map((m) => ({
        wordId: `${ps.id}-w${++w}`,
        text: m.text,
        start: m.start,
        end: m.end,
      }));
      for (const word of words) {
        const targets = pinTargets(word.text, fullRoom);
        if (ps.isLiar && targets.length === 1) {
          const objectId = targets[0]!.id;
          const label =
            lieLabel.get(normalize(word.text)) ??
            `${word.text.toUpperCase()}, printed on the ${targets[0]!.label}`;
          pins.push({ wordId: word.wordId, objectId, label });
          glances.push({ wordId: word.wordId, objectId, leadMs: GLANCE_LEAD_MS });
        } else if (!ps.isLiar && targets.length === 0) {
          const h = herringByWord.get(normalize(word.text));
          herrings.push({
            wordId: word.wordId,
            nearObjectId: h?.nearObjectId ?? null,
            rebuttal:
              h?.rebuttal ??
              `Nothing in this room says "${word.text}". Listen for details only your room could give them.`,
          });
        }
      }
      return { id: `${ps.id}-l${li + 1}`, text: parsed.text, words };
    });
    return { id: ps.id, name: ps.name, relation: ps.relation, isLiar: ps.isLiar, lines };
  });

  if (problems.length) throw new DraftError(problems);

  return {
    version: 1,
    caseId: `case-${plan.seed.toString(36)}`,
    seed: plan.seed,
    writer,
    victim: plan.victim,
    timeOfDeath: plan.timeOfDeath,
    intro: draft.intro,
    suspects,
    pins,
    herrings,
    glances,
    confession: draft.confession,
    props: plan.props,
  };
}
