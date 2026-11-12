// Build a case that is guaranteed to be solvable:
//   plan in code -> Claude writes -> solver checks -> one rewrite with the
//   solver's errors -> offline template writer if Claude still fails.

import type { CaseFile, RoomObject } from "./types.ts";
import { planCase } from "./planner.ts";
import { assembleCase, DraftError } from "./assemble.ts";
import { solveCase } from "./solver.ts";
import { writeTemplateDraft } from "./writer-template.ts";
import type { DraftWriter } from "./writer-llm.ts";

export interface GenerateOptions {
  seed?: number;
  /** Omit to build the case offline with the template writer only. */
  writer?: DraftWriter;
  /** Claude attempts before falling back (default 2: first draft + one rewrite). */
  attempts?: number;
}

export interface GenerateReport {
  caseFile: CaseFile;
  attempts: { writer: string; ok: boolean; errors: string[] }[];
}

export async function generateCase(
  room: RoomObject[],
  opts: GenerateOptions = {},
): Promise<GenerateReport> {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const plan = planCase(room, { seed });
  const attempts: GenerateReport["attempts"] = [];

  if (opts.writer) {
    let feedback: string[] = [];
    for (let i = 0; i < (opts.attempts ?? 2); i++) {
      try {
        const draft = await opts.writer.write(plan, feedback);
        const caseFile = assembleCase(plan, draft, room, "llm");
        const result = solveCase(caseFile, room);
        attempts.push({ writer: opts.writer.name, ok: result.ok, errors: result.errors });
        if (result.ok) return { caseFile, attempts };
        feedback = result.errors;
      } catch (err) {
        const errors = err instanceof DraftError ? err.problems : [String(err)];
        attempts.push({ writer: opts.writer.name, ok: false, errors });
        // A network error or refusal will not be fixed by a rewrite.
        if (!(err instanceof DraftError)) break;
        feedback = errors;
      }
    }
  }

  const caseFile = assembleCase(plan, writeTemplateDraft(plan), room, "template");
  const result = solveCase(caseFile, room);
  attempts.push({ writer: "template", ok: result.ok, errors: result.errors });
  if (!result.ok) {
    // The template writer is meant to be unbreakable; a failure here is a bug.
    throw new Error(`template case failed the solver: ${result.errors.join("; ")}`);
  }
  return { caseFile, attempts };
}
