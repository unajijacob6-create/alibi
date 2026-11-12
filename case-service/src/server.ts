// HTTP service the headset calls. Keeps the Anthropic API key off the device.
//
//   GET  /health
//   POST /v1/scan   { frames: [{ jpegBase64 }] }            -> { objects }
//   POST /v1/case   { room: RoomObject[], seed?, offline? }  -> { caseFile, attempts }
//
// Camera frames are used for the one scan request and never stored or logged.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { generateCase } from "./generate.ts";
import { ClaudeWriter } from "./writer-llm.ts";
import { RoomScanner } from "./vision.ts";

const MAX_BODY_BYTES = 25 * 1024 * 1024;
const MAX_FRAMES = 12;

const RoomObjectSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(64),
  text: z.array(z.string().max(200)).max(20),
  clueWord: z.string().max(64).optional(),
  visibleFromSeat: z.boolean(),
  confidence: z.number().min(0).max(1),
  prop: z.boolean().optional(),
});
const CaseRequest = z.object({
  room: z.array(RoomObjectSchema).max(200),
  seed: z.number().int().nonnegative().optional(),
  offline: z.boolean().optional(),
});
const ScanRequest = z.object({
  frames: z.array(z.object({ jpegBase64: z.string().min(1) })).min(1).max(MAX_FRAMES),
});

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "request body too large");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "body is not valid JSON");
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export function createApp(deps = { writer: new ClaudeWriter(), scanner: new RoomScanner() }) {
  const token = process.env.ALIBI_CLIENT_TOKEN;
  return createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
      if (token && req.headers["x-alibi-token"] !== token) throw new HttpError(401, "bad client token");

      if (req.method === "POST" && req.url === "/v1/case") {
        const parsed = CaseRequest.safeParse(await readJson(req));
        if (!parsed.success) throw new HttpError(400, parsed.error.message);
        const { room, seed, offline } = parsed.data;
        const report = await generateCase(room, { seed, writer: offline ? undefined : deps.writer });
        return send(res, 200, report);
      }

      if (req.method === "POST" && req.url === "/v1/scan") {
        const parsed = ScanRequest.safeParse(await readJson(req));
        if (!parsed.success) throw new HttpError(400, parsed.error.message);
        try {
          const objects = await deps.scanner.scan(parsed.data.frames);
          return send(res, 200, { objects });
        } catch (err) {
          // The headset switches to the pre-built apartment when the scan fails.
          console.error("scan failed:", err instanceof Error ? err.message : err);
          throw new HttpError(503, "room scan unavailable");
        }
      }

      throw new HttpError(404, "not found");
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      send(res, status, { error: err instanceof Error ? err.message : "internal error" });
    }
  });
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 8787);
  createApp().listen(port, () => console.log(`Alibi case service on http://localhost:${port}`));
}
