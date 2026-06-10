# OpenGAP Agent — Code Generation Reference

OpenGAP spec version: 0.1.0 | Output: file/folder structure (not Python code)

> Translating TO OpenGAP means generating a **directory of files**, not a single script.
> The result is a deployable git repository runnable with `opengap run` or `gitagent`.

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
├── hooks/
│   ├── hooks.yaml
│   └── scripts/
│       └── <hook-script>.sh
└── workflows/
    └── <workflow-name>.yaml
```

---

## 2. agent.yaml Template

```yaml
spec_version: "0.1.0"
name: <kebab-case-agent-name>
version: 1.0.0
description: <one-line description of what this agent does>

model:
  preferred: <model-id>         # see model mapping table below
  fallback:
    - <fallback-model-id>
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

# Include agents block only if source has sub-agents / handoffs / crews
agents:
  <sub-agent-name>:
    description: <what this sub-agent does>
    delegation:
      mode: auto                # auto | explicit | router

delegation:
  mode: auto                    # auto: LLM decides; explicit: user triggers; router: dedicated router

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

| Source framework model | OpenGAP model ID |
|------------------------|-----------------|
| `claude-opus-4-8` / `claude-opus-4-6` | `claude-opus-4-8` |
| `claude-sonnet-4-6` / `claude-sonnet-4-5-*` | `claude-sonnet-4-6` |
| `claude-haiku-4-5-*` | `claude-haiku-4-5-20251001` |
| `gpt-4o` / `openai:gpt-4o` | `openai:gpt-4o` |
| `gpt-4o-mini` | `openai:gpt-4o-mini` |
| `gemini-2.0-flash` / `gemini-1.5-pro` | `google:gemini-2.0-flash` |
| `gemini-2.0-flash-exp` | `google:gemini-2.0-flash` |
| Any Anthropic model (no prefix) | prefix with `anthropic:` |
| Any OpenAI model (no prefix) | prefix with `openai:` |

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

**Never flatten multi-agent source code into skills.** If the source has N agents with distinct roles, create N `agents/<name>/` folders.

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
  path: <tool-name>.py         # relative to tools/; create this script with the tool's logic
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
| OpenAI Agents `handoff(target_agent)` | `agents/<target>/` + `delegation.mode: explicit` |
| CrewAI `Agent(role=, goal=, backstory=)` in a crew | `agents/<agent-name>/` with SOUL.md from role+goal+backstory |
| AutoGen `GroupChat` agents | Multiple entries in `agents/`, `delegation.mode: auto` |
| LangGraph sub-graph | `agents/<subgraph-name>/` with its own skills |
| Google ADK `sub_agents=[...]` | `agents/` entries with delegation triggers |
| Agno `Team(members=[...])` | Multiple `agents/` entries |

---

## 11. workflows/ Template

Use when the source has an **ordered, deterministic flow** between sub-agents (fan-out/fan-in, sequential pipeline, conditional branching). Workflows express *what happens in what order* — sub-agents express *who does it*.

**`workflows/<workflow-name>.yaml`:**

```yaml
name: <workflow-name>           # required
description: <what this workflow does>  # optional
version: 1.0.0                  # optional

inputs:                         # optional
  - name: prompt
    type: string                # string | number | boolean | file | object | array
    required: true
    description: <what the caller provides>

outputs:                        # optional
  - name: final_output
    type: string

steps:
  - id: research                # required — unique kebab-case identifier
    action: Gather information on the topic  # required — natural language description
    agent: researcher           # optional — sub-agent to delegate to
    inputs:
      prompt: ${{ inputs.prompt }}
    outputs:
      - research_result

  - id: write                   # parallel with "code" — no depends_on conflict
    action: Write content based on research findings
    agent: writer
    inputs:
      research: ${{ steps.research.outputs.research_result }}
      prompt: ${{ inputs.prompt }}
    outputs:
      - written_content
    depends_on:
      - research

  - id: code
    action: Write code if the request requires it, otherwise return N/A
    agent: coder
    inputs:
      research: ${{ steps.research.outputs.research_result }}
      prompt: ${{ inputs.prompt }}
    outputs:
      - code_output
    depends_on:
      - research

  - id: review
    action: Review and combine all outputs into a final polished response
    agent: reviewer
    inputs:
      written: ${{ steps.write.outputs.written_content }}
      code: ${{ steps.code.outputs.code_output }}
      prompt: ${{ inputs.prompt }}
    outputs:
      - final_output
    depends_on:
      - write
      - code

error_handling:                 # optional
  on_step_failure: abort        # abort | skip | retry | escalate
  escalation_target: <agent-or-human>
```

### Key rules

| Rule | Detail |
|------|--------|
| `id` + `action` are required on every step | nothing else is mandatory |
| No `parallel:` keyword | parallelism is **implicit** — steps with the same `depends_on` set and no mutual dependency run in parallel automatically |
| No `name:` on steps | use `id:` only |
| `inputs` is a key-value object | **not** an array |
| `outputs` is an array of strings | variable names, not key-value |
| Template syntax is `${{ }}` | not `{{ }}` |

### When to generate a workflow

| Source pattern | Generate workflow? |
|---|---|
| CrewAI `Flow` with `@start`/`@listen` ordering | Yes — map each listener as a step with `depends_on` |
| CrewAI `Crew` with `Process.sequential` | Yes — one step per task in order |
| LangGraph linear chain of nodes | Yes — one step per node |
| LangGraph conditional edges | Yes — use `conditions:` on steps |
| AutoGen `GroupChat` sequential speakers | Yes |
| Google ADK `SequentialAgent` / `ParallelAgent` | Yes — sequential = `depends_on` chain; parallel = same `depends_on` |
| Pure dynamic LLM routing (no fixed order) | No — express as `delegation.mode: auto` in agent.yaml instead |

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
    - openai:gpt-4o
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
  path: web-search.py
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
| Using `parallel:` in a workflow step | No `parallel:` keyword exists — parallelism is implicit: steps with the same `depends_on` set and no mutual dependency run in parallel automatically |
| Creating `knowledge/` as a placeholder with `documents: []` | Only create `knowledge/` if the source agent has an actual RAG system, document store, or embedded reference material — never create it empty |
| Using `{{ }}` template syntax in workflows | Must be `${{ }}` — e.g. `${{ inputs.prompt }}`, `${{ steps.research.outputs.result }}` |
| Writing `allowed-tools:` with no value | `allowed-tools: ` (null) is schema-invalid — omit the line entirely when the skill uses no tools |
| Writing empty fields in agent.yaml | Omit `tools: []`, `author: ""`, `mcp_servers: []`, and any field with an empty or null value — only write fields that have content |
| Using `name:` on workflow steps | Workflow steps use `id:` not `name:` — e.g. `id: research`, not `name: research` |
| `inputs:` on a workflow step as an array | `inputs` is a key-value object (`key: value`), not a list — use `inputs:\n  prompt: ${{ inputs.prompt }}` |

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

**Tools**
- [ ] All source tool functions have corresponding `tools/<name>.yaml` files
- [ ] All `tools[]` in agent.yaml have matching `tools/<name>.yaml` files
- [ ] `type: script` tools have a matching `tools/<name>.py` file; `type: http` and `type: mcp_server` tools do not need one
- [ ] `allowed-tools` in SKILL.md frontmatter is space-separated (not comma-separated) — omitted entirely if the skill uses no tools

**Knowledge & Memory**
- [ ] `knowledge/` created ONLY if the source has an actual RAG system, document store, or embedded reference material — never created as an empty placeholder
- [ ] `memory/MEMORY.md` created only if source has persistent memory or cross-session conversation history

**Workflows**
- [ ] If source has an ordered multi-agent flow (sequential, fan-out/fan-in, conditional), a `workflows/<name>.yaml` is generated
- [ ] All workflow step `inputs` are key-value objects (not arrays)
- [ ] All workflow template expressions use `${{ }}` not `{{ }}`
- [ ] No `parallel:` keyword used in workflow — parallelism is implicit via `depends_on`

**Models & Notes**
- [ ] Model IDs are valid OpenGAP model strings (see §2 mapping table)
- [ ] All `# TRANSLATION NOTE:` comments are present where concepts are lossy
