// Room scan: send the camera frames from the player's 10-second look-around to
// Claude and get back the objects with clearly readable printed text.
// The headset then places each object in 3D from its sighting (frame + box).

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { RoomObject } from "./types.ts";
import { normalize } from "./tokens.ts";
import { MODEL } from "./writer-llm.ts";

export interface Frame {
  /** JPEG bytes, base64-encoded, from the passthrough camera. */
  jpegBase64: string;
}

export interface Sighting {
  frameIndex: number;
  /** Bounding box in the frame, as fractions of width and height (0..1). */
  box: { x: number; y: number; w: number; h: number };
}

export interface ScannedObject extends RoomObject {
  sightings: Sighting[];
}

const ScanSchema = z.object({
  objects: z.array(
    z.object({
      label: z.string(),
      text: z.array(z.string()),
      clueWord: z.string(),
      frameIndex: z.number(),
      box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
      confidence: z.number(),
    }),
  ),
});

export const SCAN_PROMPT = `These images are frames from a headset camera as a seated player slowly looks around their own room. They are playing a murder-mystery game that turns readable text on everyday objects into clues.

List the physical objects that have printed text you can read clearly: book spines and covers, posters, mugs, boxes, bottles, labels, signs, record sleeves, packaging.

For each object give:
- label: a plain one- or two-word name ("mug", "book", "poster").
- text: the printed words exactly as they appear, one string per separate piece of text. Only include text you can actually read; never guess or complete partial words. If you can't read any text on it, give an empty list.
- clueWord: the single most distinctive word in that text, the one a con artist would borrow for a made-up alibi: a name, a brand or a place ("Dorian" from "The Picture of Dorian Gray", "Kobayashi" from "KOBAYASHI PORCELAIN"). Copy it exactly as printed. Use an empty string if there is no text.
- frameIndex: the index of the frame where it is clearest (frames are numbered from 0 in the order given).
- box: where it is in that frame, as fractions of the frame's width and height, with x and y the top-left corner.
- confidence: from 0 to 1, how sure you are that both the object and its text are right.

Also include up to 5 large objects without text that a person might mention in conversation (an umbrella, a lamp, a plant, a guitar), with an empty text list.

Leave out entirely: people, faces, photographs of people, anything on a phone, computer or TV screen, and private papers such as letters, bills, documents, cards or IDs. Text from those must never appear in your answer.

If the same object appears in several frames, list it once.`;

export class RoomScanner {
  private readonly client: Anthropic;

  constructor(client?: Anthropic) {
    this.client = client ?? new Anthropic({ timeout: 45_000, maxRetries: 1 });
  }

  async scan(frames: Frame[]): Promise<ScannedObject[]> {
    if (frames.length === 0) return [];
    const content: Anthropic.ContentBlockParam[] = [];
    frames.forEach((f, i) => {
      content.push({ type: "text", text: `Frame ${i}:` });
      content.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: f.jpegBase64 },
      });
    });
    content.push({ type: "text", text: SCAN_PROMPT });

    const response = await this.client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium", format: zodOutputFormat(ScanSchema) },
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal") {
      throw new Error(`Claude declined to scan the room (${response.stop_details?.category ?? "no category"})`);
    }
    if (!response.parsed_output) throw new Error("room scan did not match the expected format");
    return toRoomObjects(response.parsed_output.objects, frames.length);
  }
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Clean up the model's list: clamp numbers, drop bad frames, merge duplicates. */
export function toRoomObjects(
  raw: z.infer<typeof ScanSchema>["objects"],
  frameCount: number,
): ScannedObject[] {
  const merged = new Map<string, ScannedObject>();
  for (const r of raw) {
    const frameIndex = Math.round(r.frameIndex);
    if (frameIndex < 0 || frameIndex >= frameCount) continue;
    const text = r.text.map((t) => t.trim()).filter(Boolean);
    const key = `${normalize(r.label)}|${text.map(normalize).sort().join(",")}`;
    const sighting: Sighting = {
      frameIndex,
      box: { x: clamp01(r.box.x), y: clamp01(r.box.y), w: clamp01(r.box.w), h: clamp01(r.box.h) },
    };
    const existing = merged.get(key);
    if (existing) {
      existing.sightings.push(sighting);
      existing.confidence = Math.max(existing.confidence, clamp01(r.confidence));
      continue;
    }
    merged.set(key, {
      id: `obj-${merged.size + 1}`,
      label: r.label.trim().toLowerCase(),
      text,
      ...(r.clueWord.trim() ? { clueWord: r.clueWord.trim() } : {}),
      // Scanned from the seat. The headset sets this false if 3D placement fails.
      visibleFromSeat: true,
      confidence: clamp01(r.confidence),
      sightings: [sighting],
    });
  }
  return [...merged.values()];
}
