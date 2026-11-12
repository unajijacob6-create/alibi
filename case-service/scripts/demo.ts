// Print a case as a readable script.
//   node scripts/demo.ts                 offline template case, sample bedroom
//   node scripts/demo.ts --llm           Claude writes the dialogue (needs credentials)
//   node scripts/demo.ts --room=bareRoom --seed=42

import { generateCase } from "../src/generate.ts";
import { ClaudeWriter } from "../src/writer-llm.ts";
import { allRooms } from "../test/fixtures.ts";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k!, v ?? "true"];
  }),
);
const roomName = (args.room ?? "bedroom") as keyof typeof allRooms;
const room = allRooms[roomName];
if (!room) throw new Error(`unknown room ${roomName}; try ${Object.keys(allRooms).join(", ")}`);

const report = await generateCase(room, {
  seed: args.seed ? Number(args.seed) : 42,
  writer: args.llm ? new ClaudeWriter() : undefined,
});
const c = report.caseFile;
const objects = new Map([...room, ...c.props].map((o) => [o.id, o]));

console.log(`\n=== ${c.caseId}  (room: ${roomName}, written by: ${c.writer}) ===\n`);
for (const line of c.intro) console.log(`NARRATOR: ${line}`);
if (c.props.length) {
  console.log(`\n[Props placed on the table: ${c.props.map((p) => `${p.label} "${p.text[0]}"`).join(", ")}]`);
}
for (const s of c.suspects) {
  console.log(`\n${s.name.toUpperCase()}, ${s.relation}${s.isLiar ? "   <- the liar" : ""}`);
  for (const l of s.lines) {
    let shown = l.text;
    for (const w of [...l.words].reverse()) {
      shown = `${shown.slice(0, w.start)}«${w.text}»${shown.slice(w.end)}`;
    }
    console.log(`  "${shown}"`);
  }
}
console.log("\nANSWER KEY");
for (const p of c.pins) {
  const word = c.suspects.flatMap((s) => s.lines.flatMap((l) => l.words)).find((w) => w.wordId === p.wordId)!;
  console.log(`  «${word.text}» -> ${objects.get(p.objectId)!.label} (${p.label})`);
}
console.log(`\nCONFESSION: "${c.confession}"`);
console.log(`\nAttempts: ${report.attempts.map((a) => `${a.writer}:${a.ok ? "ok" : "rejected"}`).join(" -> ")}`);
for (const a of report.attempts.filter((x) => !x.ok)) console.log(`  rejected because: ${a.errors.slice(0, 3).join("; ")}`);
