import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { toRoomObjects, type Frame, type ScannedObject } from "../src/vision.ts";
import { createApp } from "../src/server.ts";
import { clientKey, FixedWindowLimiter } from "../src/ratelimit.ts";
import { solveCase } from "../src/solver.ts";
import type { CaseFile } from "../src/types.ts";
import { bedroom } from "./fixtures.ts";

const box = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };

test("scan results are cleaned and duplicates across frames merged", () => {
  const objects = toRoomObjects(
    [
      { label: "Mug", text: ["KOBAYASHI"], clueWord: "KOBAYASHI", frameIndex: 0, box, confidence: 0.7 },
      { label: "mug", text: ["Kobayashi"], clueWord: "Kobayashi", frameIndex: 2, box, confidence: 0.95 },
      { label: "poster", text: ["  Monterey Jazz  ", ""], clueWord: " ", frameIndex: 1, box: { x: -1, y: 2, w: 0.5, h: 0.5 }, confidence: 1.4 },
      { label: "ghost", text: ["X"], clueWord: "", frameIndex: 9, box, confidence: 0.9 },
    ],
    3,
  );
  assert.equal(objects.length, 2, "the duplicate mug merges and the bad frame is dropped");
  const mug = objects.find((o) => o.label === "mug")!;
  assert.equal(mug.sightings.length, 2);
  assert.equal(mug.confidence, 0.95);
  const poster = objects.find((o) => o.label === "poster")!;
  assert.deepEqual(poster.text, ["Monterey Jazz"]);
  assert.deepEqual(poster.sightings[0]!.box, { x: 0, y: 1, w: 0.5, h: 0.5 });
  assert.equal(poster.confidence, 1);
});

async function withServer(fn: (url: string) => Promise<void>, scanFails = false) {
  const app = createApp({
    writer: {
      name: "llm",
      write: async () => {
        throw new Error("offline in tests");
      },
    } as never,
    scanner: {
      scan: async (_frames: Frame[]): Promise<ScannedObject[]> => {
        if (scanFails) throw new Error("no network");
        return [];
      },
    } as never,
  });
  await new Promise<void>((r) => app.listen(0, r));
  const { port } = app.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    app.close();
  }
}

test("POST /v1/case returns a solvable case", async () => {
  await withServer(async (url) => {
    const res = await fetch(`${url}/v1/case`, {
      method: "POST",
      body: JSON.stringify({ room: bedroom, seed: 3 }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { caseFile: CaseFile };
    assert.equal(body.caseFile.writer, "template", "the writer failed, so the template took over");
    assert.ok(solveCase(body.caseFile, bedroom).ok);
  });
});

test("bad requests get a 400, failed scans a 503", async () => {
  await withServer(async (url) => {
    const bad = await fetch(`${url}/v1/case`, { method: "POST", body: JSON.stringify({ room: "nope" }) });
    assert.equal(bad.status, 400);
    const scan = await fetch(`${url}/v1/scan`, {
      method: "POST",
      body: JSON.stringify({ frames: [{ jpegBase64: "AAAA" }] }),
    });
    assert.equal(scan.status, 503);
  }, true);
});

test("the limiter allows up to the limit per window, then resets", () => {
  let now = 0;
  const l = new FixedWindowLimiter(2, 1000, () => now);
  assert.equal(l.take("a"), true);
  assert.equal(l.take("a"), true);
  assert.equal(l.take("a"), false);
  assert.equal(l.take("b"), true, "other clients are counted separately");
  now = 1000;
  assert.equal(l.take("a"), true, "a new window starts fresh");
});

test("the client key prefers the proxy's forwarded address", () => {
  assert.equal(clientKey({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }, "10.0.0.1"), "203.0.113.7");
  assert.equal(clientKey({}, "198.51.100.2"), "198.51.100.2");
});

test("over the per-client limit, case requests get a 429", async () => {
  const app = createApp(
    { writer: { name: "llm", write: async () => { throw new Error("offline"); } } as never, scanner: { scan: async () => [] } as never },
    { perClientPerHour: 2, perDay: 100 },
  );
  await new Promise<void>((r) => app.listen(0, r));
  const { port } = app.address() as AddressInfo;
  try {
    const post = () =>
      fetch(`http://127.0.0.1:${port}/v1/case`, { method: "POST", body: JSON.stringify({ room: bedroom, seed: 1 }) });
    assert.equal((await post()).status, 200);
    assert.equal((await post()).status, 200);
    assert.equal((await post()).status, 429);
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200, "health checks are never limited");
  } finally {
    app.close();
  }
});
