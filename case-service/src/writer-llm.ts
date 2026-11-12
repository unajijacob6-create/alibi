// Claude writer: turns a CasePlan into noir dialogue. It never decides the
// logic (who lies, which words, which objects); the plan does. If its draft
// breaks a rule, the solver's errors are sent back for one rewrite, and the
// offline template writer takes over if it still fails.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { CaseDraft, CasePlan } from "./types.ts";

export interface DraftWriter {
  readonly name: "llm" | "template";
  write(plan: CasePlan, previousErrors: string[]): Promise<CaseDraft>;
}

const DraftSchema = z.object({
  intro: z.array(z.string()),
  suspects: z.array(z.object({ id: z.string(), lines: z.array(z.string()) })),
  confession: z.string(),
});

// Haiku: the fastest and cheapest model. The solver and the offline writer
// cover any draft it gets wrong.
export const MODEL = "claude-haiku-5-5";

export const SYSTEM_PROMPT = `You write dialogue for Alibi, a seated mixed-reality murder mystery played on a Meta Quest headset.

How the game works: three hologram suspects sit across from the player and give their alibis out loud, with captions. One suspect is lying, and like a con artist improvising in an interrogation room, they build their story from things they can see in the player's real room: a brand on a mug, a name on a book spine. The player grabs suspicious words out of the captions and pins them to the real objects they came from. Three correct pins break the liar.

You receive a plan as JSON. The plan has already decided who lies and which words they use; your job is only to write the lines so they sound like real people in a 1940s noir story.

Rules the game checks automatically (a draft that breaks any of them is rejected):
- Each suspect says each of their requiredWords exactly once, wrapped in double square brackets, spelled exactly as given: [[Kobayashi]]. Mark nothing else.
- The liar uses each required word as a natural part of the alibi: a place, a person, a drink, a show, whatever fits the word. The lie should sound confident and plausible.
- Innocent suspects mention their one required word casually. It is a red herring, not a clue.
- Never use any word from forbiddenWords, anywhere: not in narration, not in any suspect's lines, not in the confession. Rephrase around them.
- Never name or describe the player's room or its objects. Suspects talk only about their own evening.
- intro: 2-3 short narration lines that set the scene with the victim and the time of death. Do not hint at who the liar is.
- Each suspect gets 3-4 lines. Each line is one or two short spoken sentences, at most 30 words, written to be read aloud by a voice actor.
- confession: one or two sentences from the liar admitting the story was improvised from what they could see. Do not quote the lie words again.
- Keep it suitable for a general audience: tension and wit, no gore.

Return suspects in the same order and with the same ids as the plan.`;

export function buildUserMessage(plan: CasePlan, previousErrors: string[]): string {
  const brief = {
    victim: plan.victim,
    timeOfDeath: plan.timeOfDeath,
    suspects: plan.suspects.map((s) => ({
      id: s.id,
      name: s.name,
      relation: s.relation,
      role: s.isLiar ? "liar" : "innocent",
      requiredWords: s.requiredWords,
    })),
    forbiddenWords: plan.forbiddenWords,
  };
  let msg = `Plan:\n${JSON.stringify(brief, null, 2)}`;
  if (previousErrors.length) {
    msg +=
      `\n\nYour previous draft was rejected by the game's checker for these reasons. ` +
      `Write a new draft that fixes all of them:\n- ${previousErrors.join("\n- ")}`;
  }
  return msg;
}

export class ClaudeWriter implements DraftWriter {
  readonly name = "llm" as const;
  private readonly client: Anthropic;

  constructor(client?: Anthropic) {
    // Fail fast: the player is waiting through a short intro while this runs,
    // and the offline writer is ready if Claude is slow.
    this.client = client ?? new Anthropic({ timeout: 45_000, maxRetries: 1 });
  }

  async write(plan: CasePlan, previousErrors: string[]): Promise<CaseDraft> {
    const response = await this.client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // Low effort keeps the wait short. The solver catches mistakes and asks for one
      // rewrite; raise to "medium" if the attempts log shows frequent rewrites.
      output_config: { effort: "low", format: zodOutputFormat(DraftSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(plan, previousErrors) }],
    });
    // Haiku has no server-side refusal fallback; a refusal here sends the
    // generator straight to the offline writer.
    if (response.stop_reason === "refusal") {
      throw new Error(`Claude declined to write the case (${response.stop_details?.category ?? "no category"})`);
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("Claude's draft was cut off at max_tokens");
    }
    if (!response.parsed_output) {
      throw new Error("Claude's draft did not match the expected format");
    }
    return response.parsed_output;
  }
}
