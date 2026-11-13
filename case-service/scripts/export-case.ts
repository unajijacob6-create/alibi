// Write a case as JSON, e.g. as a fixture for the Unity tests or a bundled offline case.
//   node scripts/export-case.ts --room=bedroom --seed=42 --out=path/to/case.json
//   node scripts/export-case.ts --room-file=rooms/backup-apartment.json --seed=1 --out=...
// Add --llm to have Claude write the dialogue (needs ANTHROPIC_API_KEY).

import { readFileSync, writeFileSync } from "node:fs";
import type { RoomObject } from "../src/types.ts";
import { generateCase } from "../src/generate.ts";
import { ClaudeWriter } from "../src/writer-llm.ts";
import { allRooms } from "../test/fixtures.ts";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k!, v ?? "true"];
  }),
);
const room: RoomObject[] | undefined = args["room-file"]
  ? JSON.parse(readFileSync(args["room-file"], "utf8"))
  : allRooms[(args.room ?? "bedroom") as keyof typeof allRooms];
if (!room) throw new Error(`unknown room ${args.room}`);
const report = await generateCase(room, {
  seed: Number(args.seed ?? 42),
  writer: args.llm ? new ClaudeWriter() : undefined,
});
const json = JSON.stringify({ room, ...report }, null, 2);
if (args.out) writeFileSync(args.out, json + "\n");
else console.log(json);
