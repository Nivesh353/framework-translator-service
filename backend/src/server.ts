import "dotenv/config";
import express, { type Request, type Response } from "express";
import cors from "cors";
import session from "express-session";
import archiver from "archiver";
import { existsSync, createWriteStream, createReadStream } from "fs";
import { rm } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomBytes } from "crypto";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import { query } from "@open-gitagent/gitagent";
import type { GCMessage } from "@open-gitagent/gitagent";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

// ── Session typing ────────────────────────────────────────────────────────

declare module "express-session" {
  interface SessionData {
    githubToken?: string;
    oauthState?: string;
    githubUser?: { login: string; avatar_url: string };
  }
}

// ── Config ──────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const SAMPLEAGENT_DIR = path.resolve(
  process.env.SAMPLEAGENT_DIR ?? path.join(__dirname, "../../sampleagent")
);
const MODEL = process.env.MODEL ?? "anthropic:claude-sonnet-4-6";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? "";
const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-insecure-session-secret-change-me";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";
const OAUTH_CALLBACK_URL =
  process.env.OAUTH_CALLBACK_URL ?? `http://localhost:${PORT}/auth/github/callback`;
const IS_PROD = process.env.NODE_ENV === "production";
const GITHUB_OAUTH_CONFIGURED = Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET);

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

// Only allow cloning from canonical GitHub HTTPS URLs (prevents arbitrary git transports / SSRF).
const GITHUB_URL_RE = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?(?:\.git)?$/;

// ── Clone logic ───────────────────────────────────────────────────────────

/**
 * Clone a GitHub repo into srcDir. When a token is supplied, authenticate via an
 * HTTP header passed through environment-based git config (GIT_CONFIG_*), so the
 * token never appears in argv (and therefore never in `ps`, logs, or the prompt).
 */
async function cloneRepo(url: string, token: string | undefined, srcDir: string): Promise<void> {
  if (!GITHUB_URL_RE.test(url)) {
    throw new Error(`Unsupported repository URL: "${url}". Expected https://github.com/<owner>/<repo>.`);
  }

  const args = ["clone", "--depth", "1", url, srcDir];
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };

  if (token) {
    const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "http.extraheader";
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${basic}`;
  }

  try {
    await execFileAsync("git", args, { env, timeout: 120_000 });
  } catch (err: any) {
    // Scrub anything sensitive and surface a clean message.
    const msg = String(err?.stderr || err?.message || err).replace(/AUTHORIZATION:[^\n]*/gi, "AUTHORIZATION: [redacted]");
    throw new Error(`git clone failed: ${msg.trim()}`);
  }
}

// ── Conversion logic ────────────────────────────────────────────────────

function buildPrompt(targetFramework: string, srcDir: string, outDir: string): string {
  const validationStep = targetFramework.toLowerCase() === "opengap"
    ? `
After writing all files, run this command to validate:
  cd ${outDir} && opengap validate

If there are any validation errors, fix the affected files in ${outDir} and run opengap validate again.
Repeat until opengap validate passes with zero errors.
`.trim()
    : "";

  return [
    `The source repository is already cloned at ${srcDir}.`,
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
  token: string | undefined,
  onProgress?: (text: string) => void
): Promise<string> {
  const srcDir = `/tmp/gitagent-src-${sessionId}`;
  const outDir = `/tmp/gitagent-out-${sessionId}`;

  await cloneRepo(url, token, srcDir);

  const prompt = buildPrompt(targetFramework, srcDir, outDir);

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

// ── GitHub API helpers ────────────────────────────────────────────────────

interface RepoSummary {
  full_name: string;
  clone_url: string;
  private: boolean;
  description: string | null;
  updated_at: string;
}

async function fetchAllRepos(token: string): Promise<RepoSummary[]> {
  const repos: RepoSummary[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(
      `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "framework-translator",
        },
      }
    );
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const batch = (await res.json()) as any[];
    for (const r of batch) {
      repos.push({
        full_name: r.full_name,
        clone_url: r.clone_url,
        private: r.private,
        description: r.description,
        updated_at: r.updated_at,
      });
    }
    if (batch.length < 100) break;
  }
  return repos;
}

// ── Express app ─────────────────────────────────────────────────────────

const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: IS_PROD ? "none" : "lax",
      secure: IS_PROD,
      maxAge: 1000 * 60 * 60 * 8, // 8h
    },
  })
);

// GET /health
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", sampleagentDir: SAMPLEAGENT_DIR, githubOAuth: GITHUB_OAUTH_CONFIGURED });
});

// GET /frameworks
app.get("/frameworks", (_req: Request, res: Response) => {
  res.json({ frameworks: SUPPORTED_FRAMEWORKS });
});

// ── GitHub OAuth ──────────────────────────────────────────────────────────

// GET /auth/github/login → redirect to GitHub's authorize page
app.get("/auth/github/login", (req: Request, res: Response) => {
  if (!GITHUB_OAUTH_CONFIGURED) {
    res.status(503).json({ error: "GitHub OAuth is not configured on the server." });
    return;
  }
  const state = randomBytes(16).toString("hex");
  req.session.oauthState = state;

  const authUrl = new URL("https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", GITHUB_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", OAUTH_CALLBACK_URL);
  authUrl.searchParams.set("scope", "repo read:user");
  authUrl.searchParams.set("state", state);
  res.redirect(authUrl.toString());
});

// GET /auth/github/callback → exchange code for token, store in session
app.get("/auth/github/callback", async (req: Request, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string };

  if (!code || !state || state !== req.session.oauthState) {
    res.redirect(`${FRONTEND_URL}?github=error`);
    return;
  }
  req.session.oauthState = undefined;

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: OAUTH_CALLBACK_URL,
      }),
    });
    const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenJson.access_token) {
      throw new Error(tokenJson.error ?? "no access_token returned");
    }

    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "framework-translator",
      },
    });
    const user = (await userRes.json()) as { login: string; avatar_url: string };

    req.session.githubToken = tokenJson.access_token;
    req.session.githubUser = { login: user.login, avatar_url: user.avatar_url };
    res.redirect(`${FRONTEND_URL}?github=connected`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.redirect(`${FRONTEND_URL}?github=error`);
  }
});

// GET /auth/me → connection status (never exposes the token)
app.get("/auth/me", (req: Request, res: Response) => {
  res.json({
    connected: Boolean(req.session.githubToken),
    user: req.session.githubUser ?? null,
    githubOAuthConfigured: GITHUB_OAUTH_CONFIGURED,
  });
});

// POST /auth/logout → drop the session
app.post("/auth/logout", (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

// GET /repos → list the connected user's repositories
app.get("/repos", async (req: Request, res: Response) => {
  const token = req.session.githubToken;
  if (!token) {
    res.status(401).json({ error: "Not connected to GitHub." });
    return;
  }
  try {
    const repos = await fetchAllRepos(token);
    res.json({ repos });
  } catch (err) {
    console.error("List repos error:", err);
    res.status(502).json({ error: "Failed to fetch repositories from GitHub." });
  }
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
  const token = req.session.githubToken;

  console.log(`[${sessionId}] Converting ${url} → ${targetFramework}`);

  try {
    await runConversion(url, targetFramework, sessionId, token);

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
  const token = req.session.githubToken;

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
    send("progress", "Cloning repository…");
    await cloneRepo(url, token, srcDir);

    const prompt = buildPrompt(targetFramework, srcDir, outDir);

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
  console.log(`  GitHub OAuth: ${GITHUB_OAUTH_CONFIGURED ? "configured" : "NOT configured (paste-URL only)"}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /health`);
  console.log(`  GET  /frameworks`);
  console.log(`  GET  /auth/github/login   → start GitHub OAuth`);
  console.log(`  GET  /auth/github/callback`);
  console.log(`  GET  /auth/me             → connection status`);
  console.log(`  POST /auth/logout`);
  console.log(`  GET  /repos               → list connected user's repos`);
  console.log(`  POST /convert         → ZIP download`);
  console.log(`  POST /convert/stream  → SSE progress`);
  console.log(`  GET  /download/:id    → fetch completed zip\n`);
});
