# OpenGAP Agent — Code Generation Reference

OpenGAP spec version: 0.1.0 | Output: file/folder structure (not Python code)

> Translating TO OpenGAP means generating a **directory of files**, not a single script.
> The result is a deployable git repository runnable with `opengap run` or `gitagent`.

---

## 0. Multi-agent rules — READ THIS BEFORE GENERATING MULTI-AGENT OUTPUT

The output must **run on the gitagent runtime**. Multi-agent works exactly one way on gitagent:

1. Each specialist is a sub-agent under `agents/<name>/` (a mini agent with its own `agent.yaml` + `SOUL.md`).
2. The **main** agent orchestrates them through an **orchestrator skill** that uses the built-in `cli`
   tool to run each sub-agent as a separate process and read its output:

   ```
   gitagent --dir agents/<sub-agent-name> -p "<task for that sub-agent>"
   ```

There is no automatic hand-off between agents — the order and the hand-offs must be written as
**explicit steps in the orchestrator skill** (see §10a). Generating `agents/` folders without that
skill produces an agent that cannot delegate and loops.

> **Sub-agent paths use a forward slash: `agents/<name>` — never `agents.<name>` (dot).** A dotted path
> is nonexistent; gitagent silently bootstraps an empty default agent for it, so the real specialist
> never runs. The orchestrator skill must instruct the runtime to use literal slash paths and to stop
> if it sees `Creating directory` / `Created agent.yaml` (the tell-tale of a wrong path). See §10a.

**Two RULES.md constraints you MUST honor (or the agent loops forever):**

1. **Never forbid the main agent from producing output.** Do not write "Must never generate content
   directly" / "always delegate". The main agent must always be allowed to make the `cli` calls and to
   write the final synthesized answer. An absolute "never answer / always delegate" with no automatic
   router is the exact cause of the infinite memory-save loop.
2. **Do not rely on `max_turns` / `MAX_ITERATIONS` as a loop guard.** On gitagent a "turn" is one LLM
   round and a single turn can emit unlimited tool calls, so it does not bound a runaway loop. Prevent
   loops with clear "produce the final answer and stop" instructions instead.

> When in doubt, prefer the single-agent + multiple-skills form (the §12 example): one main agent with
> one skill per phase that it performs directly. It always runs on gitagent and never deadlocks. Only
> create `agents/` sub-folders when a specialist needs genuine isolation (different model or tools).

---

## 1. Output Structure

### Minimal (2 files — always required)

```
<agent-name>/
├── agent.yaml     ← REQUIRED
└── SOUL.md        ← REQUIRED
```

### Standard (most translations)

```
<agent-name>/
├── agent.yaml
├── SOUL.md
├── RULES.md
├── skills/
│   └── <skill-name>/
│       ├── SKILL.md
│       └── references/        ← optional supporting docs
└── tools/
    └── <tool-name>.yaml
```

### Full (multi-agent, knowledge, hooks)

```
<agent-name>/
├── agent.yaml
├── SOUL.md
├── RULES.md
├── agents/                    ← sub-agents (each is a mini OpenGAP agent)
│   └── <sub-agent-name>/
│       ├── agent.yaml
│       └── SOUL.md
├── skills/
│   └── <skill-name>/
│       └── SKILL.md
├── tools/
│   └── <tool-name>.yaml
├── knowledge/
│   ├── index.yaml
│   └── <doc>.md
├── memory/
│   └── MEMORY.md
└── hooks/
    ├── hooks.yaml
    └── scripts/
        └── <hook-script>.sh
```

> For multi-agent output, `skills/` must include an **orchestrator skill** (§10a) that drives the
> `agents/` sub-folders via the `cli` tool — that skill is what makes delegation actually run.

---

## 2. agent.yaml Template

```yaml
spec_version: "0.1.0"
name: <kebab-case-agent-name>
version: 1.0.0
description: <one-line description of what this agent does>

model:
  preferred: <provider:model>   # MUST be provider:model, e.g. openai:gpt-4o — see model mapping below
  fallback:
    - <provider:model>          # also provider:model — double-check the provider spelling (openai, not opengai)
  constraints:
    temperature: 0.2            # omit if not specified in source
    max_tokens: 8192            # omit if not specified in source

runtime:
  max_turns: 50                 # from source agent's max iterations, or default 50
  timeout: 300                  # seconds; omit if not time-bounded

skills:
  - <skill-name>                # one entry per skill folder under skills/

tools:
  - <tool-name>                 # file names under tools/ without .yaml

# For multi-agent sources: create agents/<name>/ folders (§10) + an orchestrator skill (§10a).
# Do NOT add an `agents:` or `delegation:` block here — the gitagent runtime does not read them;
# sub-agents are discovered from the agents/ directory and driven by the orchestrator skill.

# Include mcp_servers only if source connects to external MCP servers
mcp_servers:
  - name: <server-name>
    url: <mcp-server-url>
    description: <what this MCP server provides>

# Include a2a only if source participates in Agent-to-Agent protocol
a2a:
  endpoint: <this-agent-a2a-url>
  description: <how other agents should invoke this one>

# Include registries only if source is registered in a skill/agent marketplace
registries:
  - url: <registry-url>
    name: <registry-name>

tags:
  - <domain-tag>
```

> **Omit empty fields entirely.** Do not write `tools: []`, `author: ""`, `mcp_servers: []`, or any field with an empty/null value — omit the field if it has nothing to say.

### Required fields

| Field | Required | Rule |
|-------|----------|------|
| `name` | Yes | lowercase, hyphens only, e.g. `my-agent` |
| `version` | Yes | semver, e.g. `1.0.0` |
| `description` | Yes | one-line string |
| `spec_version` | No (but include) | always `"0.1.0"` |

### Model ID mapping

Model IDs **MUST** be in `provider:model` form. The gitagent runtime rejects a bare model ID with
`Invalid model format: "<id>". Expected "provider:model"` and the agent fails to start. Always include
the provider prefix.

| Source framework model | OpenGAP model ID |
|------------------------|-----------------|
| `claude-opus-4-8` / `claude-opus-4-6` | `anthropic:claude-opus-4-8` |
| `claude-sonnet-4-6` / `claude-sonnet-4-5-*` | `anthropic:claude-sonnet-4-6` |
| `claude-haiku-4-5-*` | `anthropic:claude-haiku-4-5-20251001` |
| `gpt-4o` / `openai:gpt-4o` | `openai:gpt-4o` |
| `gpt-4o-mini` | `openai:gpt-4o-mini` |
| `gemini-2.0-flash` / `gemini-1.5-pro` | `google:gemini-2.0-flash` |
| `gemini-2.0-flash-exp` | `google:gemini-2.0-flash` |
| Any other model | keep/add the correct `provider:` prefix — never strip it |

> **Watch for typos in the provider prefix.** It is `openai:` (not `opengai:`), `anthropic:`, `google:`.
> A misspelled provider in `model.fallback` only surfaces when the primary model fails, so it slips
> through silently — double-check every prefix in both `preferred` and `fallback`.

---

## 3. SOUL.md Template

```markdown
# Soul

## Core Identity
<Who this agent is — role, domain expertise, what makes it distinctive.
Pull from: source agent's `role` + `backstory` (CrewAI), `instructions` (OpenAI/Agno),
`system_message` (AutoGen), node function docstrings (LangGraph), `instruction` (Google ADK)>

## Purpose
<What this agent is for — its primary goal and when it should be used.>

## Communication Style
<How it communicates — tone, formality, output structure.
Derive from source agent's personality hints or leave as "Clear and helpful." if not specified.>

## Values & Principles
- <Value 1> — <brief explanation>
- <Value 2> — <brief explanation>
<Derive from source agent's behavioral rules or stated priorities.>

## Domain Expertise
- <Domain 1>: <specific knowledge areas>
- <Domain 2>: <frameworks, tools, APIs the agent knows>
<List every skill and tool domain from the CIR.>

## Collaboration Style
<How it works with humans — when it asks for confirmation, how it escalates.
Derive from source agent's human-in-the-loop configuration.>
```

> The entire SOUL.md is the agent's system prompt. Do NOT shorten or summarize — be detailed.
> Quote instructions from the source verbatim where possible.

---

## 4. RULES.md Template

```markdown
# Rules

## Must Always
- <Hard rule 1 — always do this>
- <Hard rule 2>
<Derive from: source guardrails (OpenAI Agents), task constraints (CrewAI), system prompt rules>

## Must Never
- <Hard constraint 1 — never do this>
- <Hard constraint 2>
<Derive from: output guardrails, forbidden actions in system prompts>

## Output Constraints
- <Format requirement, e.g. "Always respond in JSON", "Max 500 words">
<Derive from source agent's structured output config, Pydantic output models>

## Interaction Boundaries
- <Scope constraint, e.g. "Only analyze documents explicitly provided">
<Derive from source agent's tool restrictions or access control>
```

Omit `RULES.md` only if the source agent has no explicit constraints, guardrails, or output requirements.

---

## 5. SKILL.md Template

Skills are **capabilities** the main agent has — not discrete entities. Use the table below before deciding skills vs agents:

| Use `skills/` | Use `agents/` |
|---|---|
| A capability/behavior the main agent has | A discrete entity with its own identity, role, and purpose |
| CrewAI **Task** with a distinct purpose | CrewAI **Agent** (role + goal + backstory) |
| LangGraph **node function** | LangGraph **sub-graph** |
| OpenAI **function tool** (`@function_tool`) | OpenAI **Agent** used via `handoff` |
| Semantic Kernel plugin method | — |
| Haystack pipeline component | — |
| AutoGen tool/function | AutoGen **GroupChat** agent with its own `system_message` |
| Google ADK plain tool function | Google ADK `sub_agents=[]` entry |
| Agno tool | Agno `Team` member |

**Preserve distinct agents — but make them runnable.** If the source has N agents with genuinely
distinct roles that need isolation (different model or tools), create N `agents/<name>/` folders **and**
the orchestrator skill (§10a). If the "agents" are really just sequential phases of one worker (same
model, no isolation), the single-agent + one-skill-per-phase form (§12) is preferred — it always runs
on gitagent. Use the decision table in §10a to choose.

**What maps to a skill:**
- A CrewAI **Task** with a distinct purpose (not a CrewAI Agent)
- A LangGraph **node function** (not a sub-graph)
- A Semantic Kernel plugin
- A Haystack pipeline component with distinct behavior
- An OpenAI **function tool** (not an agent used via handoff)

**File: `skills/<skill-name>/SKILL.md`**

```markdown
---
name: <skill-name>            # kebab-case, matches folder name
description: "<When to invoke this skill. Be specific — this is used for routing.
  Triggers on: key phrases, user intents, context signals.>"
allowed-tools: tool-a tool-b   # space-separated; OMIT THIS LINE ENTIRELY if no tools (null value is schema-invalid)
metadata:
  version: "1.0.0"
  category: <domain-category>
---

# <Skill Title>

<Step-by-step instructions for this skill. Derive from the source agent's
task description, node function body, plugin method, or component logic.>

## Step 1: <Action>
<Detail>

## Step 2: <Action>
<Detail>
```

**Naming rules:**
- Use the source agent/task/node name, converted to kebab-case
- Examples: `research-web` → `research-web`, `DataExtractor` → `data-extractor`

---

## 6. Tool YAML Template

Each Python tool function from the source agent becomes a `tools/<name>.yaml` file.

```yaml
name: <tool-name>
description: <what this tool does — from the function docstring>
version: 1.0.0

input_schema:
  type: object
  properties:
    <param_name>:
      type: string              # string | integer | number | boolean | array | object
      description: <param description from source>
    <param_name_2>:
      type: integer
      description: <description>
  required:
    - <required_param_name>

output_schema:
  type: object
  properties:
    result:
      type: string
      description: <what the tool returns>

implementation:
  type: script                  # script | http | mcp_server — choose based on source (see table below)
  script: <tool-name>.py        # relative to tools/; create this script with the tool's logic
  runtime: python3
  timeout: 30

annotations:
  requires_confirmation: false  # true if tool has side effects (sends emails, writes to DB, etc.)
  read_only: <true if tool only reads data>
  idempotent: true              # true if calling multiple times produces the same result; omit if unknown
  cost: low                     # low | medium | high
```

### Implementation type selection

| Source pattern | `implementation.type` | What to generate |
|---|---|---|
| Python function / class method | `script` | `.yaml` + `.py` file with function body |
| Source calls a REST/HTTP API directly | `http` | `.yaml` only — use `http` type (see below) |
| Source connects to an MCP server | `mcp_server` | `.yaml` only — use `mcp_server` type (see below) |

**`type: http` template** (use when source calls an HTTP API — no `.py` file needed):
```yaml
implementation:
  type: http
  url: https://api.example.com/endpoint
  method: POST                  # GET | POST | PUT | DELETE | PATCH
  headers:
    Content-Type: application/json
    Authorization: Bearer ${{ env.API_KEY }}
  timeout: 30
```

**`type: mcp_server` template** (use when source connects to an MCP server):
```yaml
implementation:
  type: mcp_server
  url: https://mcp.example.com
  timeout: 30
```

> **Important**: For `script` type, the Python function body from the source goes into `tools/<name>.py`.
> For `http` and `mcp_server` types, no `.py` file is needed — the YAML is the complete definition.
> Add a `# TRANSLATION NOTE:` if the tool's runtime dependencies are unclear.

---

## 7. knowledge/ Template

Use when the source agent has a RAG system, document store, or embedded reference material.

**`knowledge/index.yaml`:**

```yaml
documents:
  - path: <filename>.md
    tags: [<tag1>, <tag2>]
    priority: high              # high | medium | low
    always_load: true           # inject into every context window?

  - path: <filename2>.md
    tags: [<tag1>]
    priority: medium
    always_load: false          # only load on demand
```

Each document is a `.md` file containing the knowledge content. Convert:
- LangGraph: `checkpointer` data → `memory/` (not `knowledge/`)
- CrewAI: `knowledge_sources` → `knowledge/<source>.md`
- Haystack: `DocumentStore` documents → `knowledge/<doc>.md`
- Lyzr ADK: `knowledge_bases=` → `knowledge/<kb>.md`
- Agno: `knowledge=` → `knowledge/<doc>.md`

---

## 8. memory/MEMORY.md Template

```markdown
# Memory

## Key Decisions
<Empty — agent fills this in during sessions>

## Current Context
<Empty — agent fills this in>

## Open Items
<Empty — agent fills this in>
```

Create `memory/MEMORY.md` if the source agent has persistent memory, conversation history across sessions, or a `TeachableAgent` pattern.

---

## 9. hooks/hooks.yaml Template

Use when the source agent has lifecycle callbacks, middleware, audit logging, or guardrails that fire at specific points.

```yaml
hooks:
  on_session_start:
    - script: scripts/<init-script>.sh
      description: <what this hook does>
      timeout: 10
      fail_open: false

  pre_tool_use:
    - script: scripts/<pre-tool-script>.sh
      description: <validation or audit before tool runs>
      timeout: 5
      fail_open: false

  post_tool_use:
    - script: scripts/<post-tool-script>.sh
      description: <validation or logging after tool runs>
      timeout: 10
      fail_open: true

  pre_response:
    - script: scripts/<response-filter>.sh
      description: <compliance check or output filtering>
      timeout: 15
      fail_open: false

  post_response:
    - script: scripts/<audit-script>.sh
      description: <audit logging>
      timeout: 5
      fail_open: true

  on_error:
    - script: scripts/<error-handler>.sh
      description: <error escalation>
      timeout: 10
      fail_open: true

  on_session_end:
    - script: scripts/<cleanup>.sh
      description: <finalization>
      timeout: 15
      fail_open: false
```

**Mapping source lifecycle events to hooks:**

| Source pattern | OpenGAP hook |
|----------------|-------------|
| OpenAI Agents input guardrail | `pre_tool_use` or `pre_response` |
| OpenAI Agents output guardrail | `post_response` |
| LangGraph `interrupt_before` / `interrupt_after` | `pre_tool_use` / `post_tool_use` |
| CrewAI callback handlers | `post_response` |
| AutoGen human_input_mode check | `pre_response` |
| Semantic Kernel filters | `pre_tool_use` / `post_tool_use` |
| Any audit logging | `post_tool_use` + `post_response` |

---

## 10. agents/ Sub-agent Template

Use when the source has multi-agent patterns: handoffs, crews, GroupChat agents, sub_agents.

Each sub-agent is a minimal OpenGAP agent:

```
agents/
└── <sub-agent-name>/
    ├── agent.yaml
    └── SOUL.md
```

**`agents/<name>/agent.yaml`:**

```yaml
spec_version: "0.1.0"
name: <sub-agent-name>
version: 1.0.0
description: <what this sub-agent does>
model:
  preferred: <model-id>
```

**`agents/<name>/SOUL.md`:**

```markdown
# Soul

## Core Identity
<Sub-agent's specific role — from source: handoff target instructions,
crew agent role+backstory, GroupChat agent system_message, sub_agent instruction>

## Purpose
<When this sub-agent is invoked and what it delivers>
```

**Multi-agent mapping:**

| Source pattern | OpenGAP equivalent |
|---------------|-------------------|
| OpenAI Agents `handoff(target_agent)` | `agents/<target>/` + orchestrator skill cli-call |
| CrewAI `Agent(role=, goal=, backstory=)` in a crew | `agents/<agent-name>/` with SOUL.md from role+goal+backstory |
| AutoGen `GroupChat` agents | Multiple entries in `agents/` + orchestrator skill |
| LangGraph sub-graph | `agents/<subgraph-name>/` with its own skills |
| Google ADK `sub_agents=[...]` | `agents/` entries + orchestrator skill cli-call |
| Agno `Team(members=[...])` | Multiple `agents/` entries + orchestrator skill |

---

### 10a. Making sub-agents actually run (REQUIRED for multi-agent output)

Creating `agents/<name>/` folders is necessary but **not sufficient** — by itself it produces an agent
that cannot delegate and will loop (see §0). Every multi-agent translation MUST also generate **one
orchestrator skill** on the **main** agent that drives the sub-agents via the `cli` tool.

**Decision: do you even need sub-agents?**

| Situation | Do this |
|---|---|
| Sub-agents are just sequential *phases* (research → code → write), same model, no isolation needed | **Preferred & most reliable:** do NOT create `agents/`. Generate one skill per phase on the main agent and let it do each phase directly. (This is what §12 shows.) |
| Sub-agents need genuine isolation (different model, different tools, independent autonomy) | Create `agents/<name>/` folders **and** the orchestrator skill below. |

**Orchestrator skill template** — `skills/orchestrate/SKILL.md`:

```markdown
---
name: orchestrate
description: "Coordinate the specialist sub-agents to fulfil the user's request. Use for any
  task that needs research, writing, or coding. Triggers on: any user request."
allowed-tools: cli read
metadata:
  version: "1.0.0"
  category: orchestration
---

# Orchestrate

Drive the specialist sub-agents in order and combine their outputs into one final answer.
Each sub-agent is run as a separate gitagent process with the `cli` tool.

## Step 0: Discover the real sub-agent folder names
Run `ls agents/` with the `cli` tool and read the exact folder names. Use those literal names in every
`gitagent --dir` call below — do not recall paths from memory.

## Step 1: Plan
Decide which specialists the request needs and in what order (e.g. researcher → coder → writer).

## Step 2: Run each specialist via the cli tool
For each specialist, call the `cli` tool:

    gitagent --dir agents/researcher -p "<the precise sub-task, including any results from earlier steps>"

**The path MUST be written exactly as `agents/<name>` with a forward slash.** Never write a dotted form
like `agents.researcher` — that is a different, nonexistent path, and gitagent will silently create an
empty throwaway agent there instead of running the real specialist.

Wait for it to finish and read its stdout. Pass the relevant output forward into the next call's prompt.
Repeat for agents/coder, agents/writer, etc., as the plan requires.

**Guard — detect a wrong path:** if a `cli` call prints `Creating directory` or `Created agent.yaml`,
the path was wrong — gitagent just bootstrapped an empty default agent (you'll see a fresh `v0.1.0`
agent with a generic identity). STOP, fix the path to `agents/<name>` with a slash, and re-run. Never
use output from a freshly-created agent.

## Step 3: Synthesize
Combine the specialists' outputs into a single, coherent final response for the user.

## Step 4: Finish
Return the final response directly. Do not loop once the task is addressed.
```

**RULES.md for an orchestrator — write it so it CANNOT deadlock:**

- ✅ DO: "Run each specialist with the `cli` tool, then synthesize their outputs into the final answer."
- ✅ DO: "When the task is fully addressed, produce the final answer and stop."
- ❌ DO NOT write "Must never generate content directly" or "always delegate" as an absolute — the main
  agent must always be allowed to (a) make the cli calls and (b) write the final synthesized answer.
  An absolute "never answer / always delegate" with no executable router is the exact cause of the
  infinite memory-save loop.

> If you are unsure whether the source's multi-agent structure is essential, prefer the single-agent
> + multiple-skills form (the §12 example). It always runs on gitagent and never deadlocks.

---

## 11. Ordering multi-agent flows

When the source has an **ordered flow** between sub-agents (sequential pipeline, fan-out/fan-in,
conditional branching), encode that order as **explicit, numbered steps in the orchestrator skill**
(§10a) — not as a separate file. The orchestrator skill is the only thing the gitagent runtime
actually executes, so the flow lives there.

| Source flow | How to encode it in the orchestrator skill |
|---|---|
| CrewAI `Crew` `Process.sequential` / `Flow` `@start`/`@listen` | One numbered step per task, in order; each step's prompt includes the previous step's output. |
| LangGraph linear chain of nodes | One step per node, in edge order. |
| LangGraph conditional edges | A step that inspects the prior result and chooses which sub-agent to call next. |
| AutoGen `GroupChat` sequential speakers | One step per speaker, in turn order. |
| Google ADK `SequentialAgent` | Steps run in sequence (each waits for the previous). |
| Google ADK `ParallelAgent` / fan-out | Run the independent sub-agents, then a final step that combines their outputs. |
| Pure dynamic routing (no fixed order) | A planning step that picks the right specialist per request, then calls it. |

Pass data between steps in plain language: include the relevant output of an earlier `cli` call inside
the prompt of the next one. Keep a final "synthesize and stop" step so the agent terminates cleanly.

---

## 12. Complete Minimal Example

**Source: LangGraph 2-agent researcher + writer**

```python
# source: research_agent.py
from langgraph.graph import StateGraph, START, END
from typing import TypedDict

class State(TypedDict):
    topic: str
    research: str
    article: str

def researcher(state: State) -> dict:
    """Searches the web for information on the topic."""
    # ... calls search tool
    return {"research": f"Research on {state['topic']}"}

def writer(state: State) -> dict:
    """Writes an article based on research."""
    return {"article": f"Article based on: {state['research']}"}

graph = StateGraph(State)
graph.add_node("researcher", researcher)
graph.add_node("writer", writer)
graph.add_edge(START, "researcher")
graph.add_edge("researcher", "writer")
graph.add_edge("writer", END)
app = graph.compile()
```

**Generated OpenGAP output:**

```
research-writer-agent/
├── agent.yaml
├── SOUL.md
├── RULES.md
├── skills/
│   ├── research/
│   │   └── SKILL.md
│   └── write/
│       └── SKILL.md
└── tools/
    └── web-search.yaml
```

**`agent.yaml`:**
```yaml
spec_version: "0.1.0"
name: research-writer-agent
version: 1.0.0
description: Researches a topic and writes an article based on findings
model:
  preferred: claude-sonnet-4-6
  fallback:
    - gpt-4o
runtime:
  max_turns: 20
skills:
  - research
  - write
tools:
  - web-search
```

**`SOUL.md`:**
```markdown
# Soul

## Core Identity
I am a research and writing agent. I search the web for information on a given topic,
synthesize my findings, and produce a well-structured article.

## Purpose
Given a topic, I produce a researched article in two phases: first gathering information,
then writing the final piece.

## Values & Principles
- Accuracy first — I verify information before writing
- Clarity — articles are readable and well-structured
- Completeness — I cover the topic thoroughly before writing

## Domain Expertise
- Web research and information synthesis
- Article writing and structuring
```

**`skills/research/SKILL.md`:**
```markdown
---
name: research
description: "Search the web for information on a topic. Use when the user provides
  a topic to research or asks for information gathering. Triggers on: research, find,
  search, gather information, look up."
allowed-tools: web-search
---

# Research

## Step 1: Search
Use the web-search tool to find relevant information on the topic.

## Step 2: Synthesize
Organize findings into key points covering the topic thoroughly.

## Step 3: Output
Return a structured summary of findings for the writer to use.
```

**`skills/write/SKILL.md`:**
```markdown
---
name: write
description: "Write an article based on research findings. Use after research is
  complete or when the user asks to write, draft, or produce an article.
  Triggers on: write, draft, article, produce content."
---

# Write

## Step 1: Structure
Organize the research into an introduction, body sections, and conclusion.

## Step 2: Draft
Write the article in clear, engaging prose.

## Step 3: Review
Check for completeness and coherence before delivering.
```

**`tools/web-search.yaml`:**
```yaml
name: web-search
description: Search the web for information on a query
version: 1.0.0
input_schema:
  type: object
  properties:
    query:
      type: string
      description: Search query
  required: [query]
output_schema:
  type: object
  properties:
    results:
      type: array
      items:
        type: object
        properties:
          title: {type: string}
          url: {type: string}
          snippet: {type: string}
implementation:
  type: script
  script: web-search.py
  runtime: python3
  timeout: 30
annotations:
  read_only: true
  cost: low
```

---

## 13. Common Pitfalls

| Mistake | Fix |
|---------|-----|
| Putting Python code in SOUL.md | SOUL.md is markdown prose only — move logic to skill steps or tool scripts |
| Putting agent identity in RULES.md | Identity/purpose belongs in SOUL.md; RULES.md is constraints only |
| Forgetting to create `tools/<name>.py` alongside `tools/<name>.yaml` | YAML is the interface; the implementation script must also be generated (for `type: script` only — `http` and `mcp_server` need no `.py` file) |
| Using Python import paths as tool names | Tool names are kebab-case identifiers, not module paths |
| One skill per source function | Group related functions into one skill; skills are capabilities, not individual functions |
| Skipping `spec_version` | Always include `spec_version: "0.1.0"` in agent.yaml |
| Putting framework-specific code in SKILL.md | SKILL.md contains natural language instructions, not Python code |
| Translating a LangGraph State as a skill | State schema belongs in the CIR notes, not as a skill — OpenGAP doesn't have explicit state objects |
| Missing `name` field in SKILL.md frontmatter | `name` must match the folder name exactly (kebab-case) |
| Agent name with underscores | Use hyphens, not underscores: `my-agent` not `my_agent` |
| Creating `agents/` sub-folders with no orchestrator skill | The main agent then has no way to call them and loops — always add the orchestrator skill (§10a) |
| RULES.md saying "never generate content directly / always delegate" | Causes the infinite memory-save loop — the main agent must be allowed to make `cli` calls and write the final answer |
| Emitting a `delegation:` or `agents:` block in `agent.yaml`, or a `workflows/*.yaml` | The gitagent runtime does not execute them — encode order in the orchestrator skill instead |
| Bare model id without provider | `model.preferred`/`fallback` must be `provider:model` (e.g. `openai:gpt-4o`) or the runtime refuses to start |
| Creating `knowledge/` as a placeholder with `documents: []` | Only create `knowledge/` if the source agent has an actual RAG system, document store, or embedded reference material — never create it empty |
| Writing `allowed-tools:` with no value | `allowed-tools: ` (null) is schema-invalid — omit the line entirely when the skill uses no tools |
| Writing empty fields in agent.yaml | Omit `tools: []`, `author: ""`, `mcp_servers: []`, and any field with an empty or null value — only write fields that have content |

---

## 14. Translation Checklist

Before delivering the OpenGAP output, verify:

**Structure**
- [ ] `agent.yaml` present with `name`, `version`, `description`, `spec_version`
- [ ] `SOUL.md` present with Core Identity section populated
- [ ] No empty fields in `agent.yaml` — `tools: []`, `author: ""`, `mcp_servers: []` etc. are omitted
- [ ] Agent name is kebab-case (no underscores, no spaces)

**Skills vs Agents**
- [ ] Source agents with distinct role/identity are in `agents/<name>/` sub-folders (not flattened into `skills/`)
- [ ] Each `agents/<name>/` has `agent.yaml` + `SOUL.md`; no `AGENTS.md` file created
- [ ] All `skills[]` in agent.yaml have matching `skills/<name>/` folders with `SKILL.md`
- [ ] Source instructions/system prompts are verbatim in SOUL.md (not paraphrased)
- [ ] Source constraints/guardrails are in RULES.md

**Multi-agent (only if `agents/` sub-folders exist)**
- [ ] An orchestrator skill (§10a) exists on the main agent that runs each sub-agent via the `cli` tool
- [ ] No `agents:` / `delegation:` block in `agent.yaml` and no `workflows/*.yaml` (the runtime ignores them)
- [ ] RULES.md does NOT forbid the main agent from producing output / does not mandate absolute delegation
- [ ] The orchestrator skill ends with a "synthesize the final answer and stop" step

**Tools**
- [ ] All source tool functions have corresponding `tools/<name>.yaml` files
- [ ] All `tools[]` in agent.yaml have matching `tools/<name>.yaml` files
- [ ] `type: script` tools have a matching `tools/<name>.py` file; `type: http` and `type: mcp_server` tools do not need one
- [ ] `allowed-tools` in SKILL.md frontmatter is space-separated (not comma-separated) — omitted entirely if the skill uses no tools

**Knowledge & Memory**
- [ ] `knowledge/` created ONLY if the source has an actual RAG system, document store, or embedded reference material — never created as an empty placeholder
- [ ] `memory/MEMORY.md` created only if source has persistent memory or cross-session conversation history

**Flow ordering**
- [ ] Any ordered multi-agent flow is encoded as numbered steps in the orchestrator skill (not a workflow file)
- [ ] Data is passed between steps by including the prior step's output in the next step's prompt

**Models & Notes**
- [ ] Model IDs are valid `provider:model` strings (see §2 mapping table) — every `preferred` and `fallback` has a provider prefix
- [ ] All `# TRANSLATION NOTE:` comments are present where concepts are lossy
