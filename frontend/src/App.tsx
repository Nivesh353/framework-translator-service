import { useEffect, useMemo, useRef, useState } from "react";

const API = import.meta.env.VITE_API_URL ?? "/api";

type Status = "idle" | "converting" | "done" | "error";
type Mode = "url" | "github";

interface LogLine {
  text: string;
  type: "progress" | "tool" | "validating";
}

interface Repo {
  full_name: string;
  clone_url: string;
  private: boolean;
  description: string | null;
  updated_at: string;
}

interface GhUser {
  login: string;
  avatar_url: string;
}

export default function App() {
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [framework, setFramework] = useState("");
  const [frameworks, setFrameworks] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const logEndRef = useRef<HTMLDivElement>(null);

  // GitHub connection state
  const [ghConfigured, setGhConfigured] = useState(false);
  const [ghUser, setGhUser] = useState<GhUser | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState("");
  const [ghNotice, setGhNotice] = useState("");

  useEffect(() => {
    fetch(`${API}/frameworks`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setFrameworks(d.frameworks);
        setFramework(d.frameworks[0] ?? "");
      })
      .catch(() => {});
  }, []);

  // Check GitHub connection on load + handle the OAuth redirect (?github=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ghParam = params.get("github");
    if (ghParam) {
      if (ghParam === "connected") {
        setMode("github");
        setGhNotice("GitHub connected.");
      } else if (ghParam === "error") {
        setGhNotice("GitHub connection failed. Please try again.");
      }
      params.delete("github");
      const clean = window.location.pathname + (params.toString() ? `?${params}` : "");
      window.history.replaceState({}, "", clean);
    }
    refreshAuth();
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function refreshAuth() {
    try {
      const r = await fetch(`${API}/auth/me`, { credentials: "include" });
      const d = await r.json();
      setGhConfigured(Boolean(d.githubOAuthConfigured));
      setGhUser(d.connected ? d.user : null);
      if (d.connected) loadRepos();
    } catch {
      /* ignore */
    }
  }

  async function loadRepos() {
    setReposLoading(true);
    try {
      const r = await fetch(`${API}/repos`, { credentials: "include" });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setRepos(d.repos ?? []);
    } catch {
      setRepos([]);
    } finally {
      setReposLoading(false);
    }
  }

  function connectGithub() {
    window.location.href = `${API}/auth/github/login`;
  }

  async function disconnectGithub() {
    await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
    setGhUser(null);
    setRepos([]);
    setSelectedRepo("");
    setUrl("");
  }

  function pickRepo(repo: Repo) {
    setSelectedRepo(repo.full_name);
    setUrl(repo.clone_url);
  }

  const filteredRepos = useMemo(() => {
    const q = repoSearch.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) => r.full_name.toLowerCase().includes(q));
  }, [repos, repoSearch]);

  async function handleConvert() {
    if (!url.trim() || !framework) return;
    setStatus("converting");
    setLogs([]);
    setSessionId("");
    setErrorMsg("");

    try {
      const res = await fetch(`${API}/convert/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: url.trim(), targetFramework: framework }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const chunk of parts) {
          let event = "message";
          let data = "";
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event: ")) event = line.slice(7).trim();
            if (line.startsWith("data: ")) data = line.slice(6).trim();
          }
          if (!data) continue;
          const payload: string = JSON.parse(data);

          if (event === "progress") {
            setLogs((l) => [...l, { text: payload, type: "progress" }]);
          } else if (event === "tool") {
            setLogs((l) => [...l, { text: `⚙ ${payload}`, type: "tool" }]);
          } else if (event === "validating") {
            setLogs((l) => [...l, { text: `✦ Validating OpenGAP structure…`, type: "validating" }]);
          } else if (event === "done") {
            setSessionId(payload);
            setStatus("done");
          } else if (event === "error") {
            setErrorMsg(payload);
            setStatus("error");
          }
        }
      }
    } catch (err) {
      setErrorMsg(String(err));
      setStatus("error");
    }
  }

  const repoName = url.split("/").pop()?.replace(/\.git$/, "") ?? "agent";
  const zipName = `${repoName}-${framework.toLowerCase().replace(/\s+/g, "-")}.zip`;
  const busy = status === "converting";

  const tabClass = (active: boolean) =>
    `flex-1 text-sm font-sans font-medium rounded-lg px-4 py-2 transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "bg-secondary text-secondary-foreground border border-border hover:bg-muted"
    }`;

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-12 font-sans">
      <div className="w-full max-w-2xl space-y-8">

        {/* Branding */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-3">
            <img
              src="https://cdn2.futurepedia.io/2026-02-26T19-07-25.498Z-q6ZO1hg4Romi6JbT7L06v7dv3Sy2zIBis.png?w=256"
              alt="Lyzr"
              className="w-9 h-9 rounded-lg object-contain"
            />
            <div className="text-left">
              <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground leading-tight">
                Framework Translator
              </h1>
              <p className="text-xs font-sans text-muted-foreground uppercase tracking-widest">
                Powered by Lyzr
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground max-w-md">
            Paste a GitHub repo URL or connect GitHub to pick a repo, choose a target framework, and download the converted agent.
          </p>
        </div>

        {/* Form card */}
        <div className="glass-card border border-border rounded-[var(--radius)] p-6 space-y-5 shadow-sm">

          {/* Source toggle */}
          <div className="flex gap-2">
            <button className={tabClass(mode === "url")} onClick={() => setMode("url")} disabled={busy}>
              Paste URL
            </button>
            <button className={tabClass(mode === "github")} onClick={() => setMode("github")} disabled={busy}>
              Connect GitHub
            </button>
          </div>

          {/* URL mode */}
          {mode === "url" && (
            <div className="space-y-1.5">
              <label className="block text-xs font-sans font-medium text-muted-foreground uppercase tracking-widest">
                GitHub Repository URL
              </label>
              <input
                type="url"
                placeholder="https://github.com/owner/repo"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={busy}
                className="w-full glass-input border border-border rounded-lg px-4 py-2.5 text-sm font-sans text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 transition-colors"
              />
            </div>
          )}

          {/* GitHub mode */}
          {mode === "github" && (
            <div className="space-y-3">
              {ghNotice && (
                <p className="text-xs text-muted-foreground">{ghNotice}</p>
              )}

              {!ghConfigured && (
                <p className="text-sm text-amber-700">
                  GitHub OAuth isn’t configured on the server. Set GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET, or use “Paste URL”.
                </p>
              )}

              {ghConfigured && !ghUser && (
                <button
                  onClick={connectGithub}
                  disabled={busy}
                  className="flex items-center justify-center gap-2 w-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 font-sans font-medium rounded-lg px-4 py-2.5 text-sm transition-opacity"
                >
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  Connect GitHub
                </button>
              )}

              {ghUser && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img src={ghUser.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                      <span className="text-sm text-foreground">{ghUser.login}</span>
                    </div>
                    <button
                      onClick={disconnectGithub}
                      disabled={busy}
                      className="text-xs font-sans font-medium text-muted-foreground hover:text-foreground underline disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  </div>

                  <input
                    type="text"
                    placeholder="Search your repositories…"
                    value={repoSearch}
                    onChange={(e) => setRepoSearch(e.target.value)}
                    disabled={busy}
                    className="w-full glass-input border border-border rounded-lg px-4 py-2.5 text-sm font-sans text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 transition-colors"
                  />

                  <div className="border border-border rounded-lg max-h-64 overflow-y-auto divide-y divide-border">
                    {reposLoading && (
                      <div className="px-4 py-3 text-sm text-muted-foreground">Loading repositories…</div>
                    )}
                    {!reposLoading && filteredRepos.length === 0 && (
                      <div className="px-4 py-3 text-sm text-muted-foreground">No repositories found.</div>
                    )}
                    {!reposLoading && filteredRepos.map((repo) => (
                      <button
                        key={repo.full_name}
                        onClick={() => pickRepo(repo)}
                        disabled={busy}
                        className={`w-full text-left px-4 py-2.5 hover:bg-muted transition-colors disabled:opacity-50 ${
                          selectedRepo === repo.full_name ? "bg-muted" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-foreground truncate">{repo.full_name}</span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                              repo.private
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-green-50 text-green-700 border-green-200"
                            }`}
                          >
                            {repo.private ? "private" : "public"}
                          </span>
                        </div>
                        {repo.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{repo.description}</p>
                        )}
                      </button>
                    ))}
                  </div>

                  {selectedRepo && (
                    <p className="text-xs text-muted-foreground">
                      Selected: <span className="text-foreground font-medium">{selectedRepo}</span>
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-sans font-medium text-muted-foreground uppercase tracking-widest">
              Target Framework
            </label>
            <select
              value={framework}
              onChange={(e) => setFramework(e.target.value)}
              disabled={busy}
              className="w-full glass-input border border-border rounded-lg px-4 py-2.5 text-sm font-sans text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 transition-colors"
            >
              {frameworks.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleConvert}
            disabled={busy || !url.trim() || !framework}
            className="w-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 font-sans font-medium rounded-lg px-4 py-2.5 text-sm transition-opacity"
          >
            {busy ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
                Converting…
              </span>
            ) : "Convert"}
          </button>
        </div>

        {/* Progress log */}
        {(status === "converting" || status === "done" || status === "error") && (
          <div className="glass-card border border-border rounded-[var(--radius)] p-5 space-y-4 shadow-sm">

            {/* Header row */}
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-base font-medium text-foreground tracking-tight">
                Conversion Log
              </h2>
              {status === "converting" && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-sans font-medium bg-blue-50 text-blue-700 border border-blue-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  Running
                </span>
              )}
              {status === "done" && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-sans font-medium bg-green-50 text-green-700 border border-green-200">
                  ● Done
                </span>
              )}
              {status === "error" && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-sans font-medium bg-red-50 text-red-700 border border-red-200">
                  ✗ Failed
                </span>
              )}
            </div>

            {/* Log box */}
            <div className="bg-[hsl(36,33%,91%)] border border-border rounded-lg p-3 h-64 overflow-y-auto font-mono text-xs leading-relaxed">
              {logs.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.type === "tool"       ? "text-muted-foreground" :
                    line.type === "validating" ? "text-amber-700 font-medium" :
                    "text-foreground"
                  }
                >
                  {line.text}
                </div>
              ))}
              {status === "error" && (
                <div className="text-red-700 mt-1">{errorMsg}</div>
              )}
              <div ref={logEndRef} />
            </div>

            {/* Download button */}
            {status === "done" && sessionId && (
              <a
                href={`${API}/download/${sessionId}`}
                download={zipName}
                className="flex items-center justify-center gap-2 w-full bg-primary text-primary-foreground hover:opacity-90 font-sans font-medium rounded-lg px-4 py-2.5 text-sm transition-opacity"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Download {zipName}
              </a>
            )}

            {/* Retry button */}
            {status === "error" && (
              <button
                onClick={() => setStatus("idle")}
                className="w-full bg-secondary text-secondary-foreground border border-border hover:bg-muted font-sans font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs font-sans text-muted-foreground">
          Powered by Lyzr Framework Translator
        </p>

      </div>
    </div>
  );
}
