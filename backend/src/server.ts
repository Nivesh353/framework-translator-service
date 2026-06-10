import "dotenv/config";
import express, { type Request, type Response } from "express";
import cors from "cors";
import archiver from "archiver";
import { existsSync, createWriteStream, createReadStream } from "fs";
import { rm } from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import { query } from "@open-gitagent/gitagent";
import type { GCMessage } from "@open-gitagent/gitagent";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const SAMPLEAGENT_DIR = path.resolve(
  process.env.SAMPLEAGENT_DIR ?? path.join(__dirname, "../../sampleagent")
);
const MODEL = process.env.MODEL ?? "anthropic:claude-sonnet-4-6";

const SUPPORTED_FRAMEWORKS = [
  "LangGraph",
  "CrewAI",
  "OpenAI Agents SDK",
  "AutoGen",
  "Semantic Kernel",
  "Haystack",
  "Agno",
  "Google ADK",
  "Lyzr ADK",
  "OpenGAP",
];

// ── Conversion logic ────────────────────────────────────────────────────

function buildPrompt(url: string, targetFramework: string, srcDir: string, outDir: string): string {
  const validationStep = targetFramework.toLowerCase() === "opengap"
    ? `
After writing all files, run this command to validate:
  cd ${outDir} && opengap validate

If there are any validation errors, fix the affected files in ${outDir} and run opengap validate again.
Repeat until opengap validate passes with zero errors.
`.trim()
    : "";

  return [
    `Clone the GitHub repo at ${url} into ${srcDir}.`,
    `Analyze it to detect the source framework.`,
    `Translate it to ${targetFramework} format.`,
    `Write ALL output files into ${outDir}/.`,
    validationStep,
    `When fully done, print exactly: CONVERSION_DONE:${outDir}`,
    `IMPORTANT: Do NOT create any GitHub repositories, push any code, or do anything beyond writing files to ${outDir}. Stop immediately after printing CONVERSION_DONE.`,
  ].filter(Boolean).join("\n");
}

async function runConversion(
  url: string,
  targetFramework: string,
  sessionId: string,
  onProgress?: (text: string) => void
): Promise<string> {
  const srcDir = `/tmp/gitagent-src-${sessionId}`;
  const outDir = `/tmp/gitagent-out-${sessionId}`;

  const prompt = buildPrompt(url, targetFramework, srcDir, outDir);

  const session = query({
    prompt,
    dir: SAMPLEAGENT_DIR,
    model: MODEL,
    maxTurns: 50,
  });

  for await (const msg of session as AsyncIterable<GCMessage>) {
    if (msg.type === "delta" && onProgress) {
      onProgress(msg.content);
    }
    if (msg.type === "system" && msg.subtype === "error") {
      throw new Error(msg.content);
    }
  }

  if (!existsSync(outDir)) {
    throw new Error(
      `Agent completed but output directory not found at ${outDir}. ` +
      `The agent may not have written files to the expected location.`
    );
  }

  return outDir;
}

const pendingZips = new Map<string, string>();

// ── Express app ─────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// GET /health
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", sampleagentDir: SAMPLEAGENT_DIR });
});

// GET /frameworks
app.get("/frameworks", (_req: Request, res: Response) => {
  res.json({ frameworks: SUPPORTED_FRAMEWORKS });
});

// POST /convert  →  returns ZIP download
app.post("/convert", async (req: Request, res: Response) => {
  const { url, targetFramework = "OpenGAP" } = req.body ?? {};

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url is required" });
    return;
  }

  if (!SUPPORTED_FRAMEWORKS.map(f => f.toLowerCase()).includes(targetFramework.toLowerCase())) {
    res.status(400).json({
      error: `Unsupported targetFramework: "${targetFramework}"`,
      supported: SUPPORTED_FRAMEWORKS,
    });
    return;
  }

  const sessionId = uuidv4();
  const srcDir = `/tmp/gitagent-src-${sessionId}`;
  const outDir = `/tmp/gitagent-out-${sessionId}`;
  const repoName = url.split("/").pop()?.replace(/\.git$/, "") ?? "agent";
  const zipName = `${repoName}-${targetFramework.toLowerCase().replace(/\s+/g, "-")}.zip`;

  console.log(`[${sessionId}] Converting ${url} → ${targetFramework}`);

  try {
    await runConversion(url, targetFramework, sessionId);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);
    res.setHeader("X-Session-Id", sessionId);

    const archive = archiver("zip", { zlib: { level: 6 } });

    archive.on("error", (err) => {
      console.error(`[${sessionId}] Archive error:`, err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });

    archive.pipe(res);
    archive.directory(outDir, repoName);
    await archive.finalize();

    console.log(`[${sessionId}] Done — sent ${zipName}`);

  } catch (err) {
    console.error(`[${sessionId}] Error:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: String(err) });
    }
  } finally {
    await rm(srcDir, { recursive: true, force: true }).catch(() => {});
    await rm(outDir, { recursive: true, force: true }).catch(() => {});
  }
});

// POST /convert/stream  →  SSE progress + zip download URL
app.post("/convert/stream", async (req: Request, res: Response) => {
  const { url, targetFramework = "OpenGAP" } = req.body ?? {};

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url is required" });
    return;
  }

  const sessionId = uuidv4();
  const srcDir = `/tmp/gitagent-src-${sessionId}`;
  const outDir = `/tmp/gitagent-out-${sessionId}`;
  const repoName = url.split("/").pop()?.replace(/\.git$/, "") ?? "agent";

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: string, data: string) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  console.log(`[${sessionId}] Streaming conversion ${url} → ${targetFramework}`);

  try {
    const prompt = buildPrompt(url, targetFramework, srcDir, outDir);

    const session = query({
      prompt,
      dir: SAMPLEAGENT_DIR,
      model: MODEL,
      maxTurns: 50,
    });

    for await (const msg of session as AsyncIterable<GCMessage>) {
      if (msg.type === "delta") {
        send("progress", msg.content);
      }
      if (msg.type === "tool_use") {
        const label = `${msg.toolName}(${JSON.stringify(msg.args).slice(0, 120)})`;
        const isValidate = msg.toolName === "bash" && JSON.stringify(msg.args).includes("opengap validate");
        send(isValidate ? "validating" : "tool", label);
      }
      if (msg.type === "system" && msg.subtype === "error") {
        throw new Error(msg.content);
      }
    }

    if (!existsSync(outDir)) {
      throw new Error("Agent did not produce output directory");
    }

    // Save zip to a temp file and send its path so client can download
    const zipPath = `/tmp/gitagent-zip-${sessionId}.zip`;
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("error", reject);
      output.on("close", resolve);
      archive.pipe(output);
      archive.directory(outDir, repoName);
      archive.finalize();
    });

    pendingZips.set(sessionId, zipPath);
    send("done", sessionId);
    res.end();

  } catch (err) {
    console.error(`[${sessionId}] Stream error:`, err);
    send("error", String(err));
    res.end();
  } finally {
    await rm(srcDir, { recursive: true, force: true }).catch(() => {});
    await rm(outDir, { recursive: true, force: true }).catch(() => {});
  }
});

// GET /download/:sessionId  →  serve completed zip then clean up
app.get("/download/:sessionId", async (req: Request, res: Response) => {
  const sessionId = req.params["sessionId"] as string;
  const zipPath = pendingZips.get(sessionId);
  if (!zipPath || !existsSync(zipPath)) {
    res.status(404).json({ error: "Not found or already downloaded" });
    return;
  }
  const fileName = path.basename(zipPath);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  const stream = createReadStream(zipPath);
  stream.pipe(res);
  stream.on("close", async () => {
    pendingZips.delete(sessionId);
    await rm(zipPath, { force: true }).catch(() => {});
  });
});

// ── Start ────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\nFramework Converter Service`);
  console.log(`  URL:          http://localhost:${PORT}`);
  console.log(`  Sampleagent:  ${SAMPLEAGENT_DIR}`);
  console.log(`  Model:        ${MODEL}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /health`);
  console.log(`  GET  /frameworks`);
  console.log(`  POST /convert         → ZIP download`);
  console.log(`  POST /convert/stream  → SSE progress`);
  console.log(`  GET  /download/:id    → fetch completed zip\n`);
});
