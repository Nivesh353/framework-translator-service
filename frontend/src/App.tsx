import { useEffect, useRef, useState } from "react";

type Status = "idle" | "converting" | "done" | "error";

interface LogLine {
  text: string;
  type: "progress" | "tool" | "validating";
}

export default function App() {
  const [url, setUrl] = useState("");
  const [framework, setFramework] = useState("");
  const [frameworks, setFrameworks] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/frameworks")
      .then((r) => r.json())
      .then((d) => {
        setFrameworks(d.frameworks);
        setFramework(d.frameworks[0] ?? "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function handleConvert() {
    if (!url.trim() || !framework) return;
    setStatus("converting");
    setLogs([]);
    setSessionId("");
    setErrorMsg("");

    try {
      const res = await fetch("/api/convert/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
            Paste a GitHub repo URL, pick a target framework, and download the converted agent.
          </p>
        </div>

        {/* Form card */}
        <div className="glass-card border border-border rounded-[var(--radius)] p-6 space-y-5 shadow-sm">
          <div className="space-y-1.5">
            <label className="block text-xs font-sans font-medium text-muted-foreground uppercase tracking-widest">
              GitHub Repository URL
            </label>
            <input
              type="url"
              placeholder="https://github.com/owner/repo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={status === "converting"}
              className="w-full glass-input border border-border rounded-lg px-4 py-2.5 text-sm font-sans text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-sans font-medium text-muted-foreground uppercase tracking-widest">
              Target Framework
            </label>
            <select
              value={framework}
              onChange={(e) => setFramework(e.target.value)}
              disabled={status === "converting"}
              className="w-full glass-input border border-border rounded-lg px-4 py-2.5 text-sm font-sans text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 transition-colors"
            >
              {frameworks.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleConvert}
            disabled={status === "converting" || !url.trim() || !framework}
            className="w-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 font-sans font-medium rounded-lg px-4 py-2.5 text-sm transition-opacity"
          >
            {status === "converting" ? (
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
                href={`/api/download/${sessionId}`}
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
