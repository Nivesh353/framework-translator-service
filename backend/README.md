# Framework Converter Service

HTTP service that takes a GitHub repo URL + target framework and returns a ZIP of the converted agent — powered by the `framework-translator-agent` (sampleagent) via the gitagent SDK.

## Setup

```bash
cd convert-service
npm install
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

## Run

```bash
# Development (auto-reload)
npm run dev

# Production
npm run build && npm start
```

## API

### `GET /health`
```bash
curl http://localhost:3000/health
# { "status": "ok", "sampleagentDir": "..." }
```

### `GET /frameworks`
```bash
curl http://localhost:3000/frameworks
# { "frameworks": ["LangGraph", "CrewAI", "OpenGAP", ...] }
```

### `POST /convert` → ZIP download
```bash
curl -X POST http://localhost:3000/convert \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/patel-lyzr/single-agent-langraph", "targetFramework": "OpenGAP"}' \
  --output agent.zip

# Inspect contents
unzip -l agent.zip
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `url` | Yes | — | GitHub repo URL to convert |
| `targetFramework` | No | `"OpenGAP"` | Target framework name (see `/frameworks`) |

### `POST /convert/stream` → SSE progress
Stream agent progress as Server-Sent Events, then receive the zip path when done.

```bash
curl -X POST http://localhost:3000/convert/stream \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/patel-lyzr/single-agent-langraph", "targetFramework": "CrewAI"}'
```

Events:
- `event: progress` — streaming text from the agent
- `event: tool` — tool calls (clone, read, write, etc.)
- `event: done` — conversion complete, data = zip file path
- `event: error` — something went wrong

## How it works

1. Service calls `query()` from `@open-gitagent/gitagent` SDK
2. Points it at the local `sampleagent/` folder (the framework-translator-agent)
3. Agent clones the repo, analyzes the framework, translates to target
4. Service zips the output directory and returns it
5. Temp files are cleaned up automatically

## Requirements

- Node.js >= 20
- `ANTHROPIC_API_KEY` set in `.env`
- The `sampleagent/` folder must exist at `../sampleagent` (or set `SAMPLEAGENT_DIR`)
