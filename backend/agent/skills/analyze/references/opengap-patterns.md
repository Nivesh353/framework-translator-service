# OpenGAP Agent — Detection & Analysis Patterns

OpenGAP spec version: 0.1.0 | Format: file-structure (not Python code)

> OpenGAP agents are **git repositories**, not Python packages. Detection and analysis are file-based, not import-based.

---

## 1. Detection Fingerprints

### Primary Signals (file-based)

| Signal | What to look for |
|--------|-----------------|
| `agent.yaml` at repo root | File exists with `spec_version: "0.1.0"` field |
| `SOUL.md` at repo root | Markdown file defining agent identity and purpose |
| Both files present | High-confidence OpenGAP agent |

### Secondary Signals

| Signal | Meaning |
|--------|---------|
| `skills/` directory with `*/SKILL.md` files | Agent has skill modules |
| `tools/` directory with `*.yaml` files | Agent has declarative tool definitions |
| `knowledge/index.yaml` | Agent has a knowledge base |
| `memory/MEMORY.md` | Agent uses persistent memory |
| `hooks/hooks.yaml` | Agent has lifecycle hooks |
| `agents/` directory with sub-folders | Agent has sub-agents |
| `workflows/` directory with `*.yaml` | Agent has deterministic workflows |
| `compliance/` directory | Agent has compliance configuration |

### Confidence Rules

- `agent.yaml` (with `spec_version`) + `SOUL.md` → **high confidence**
- `agent.yaml` only (no `SOUL.md`) → **medium confidence** — may be incomplete OpenGAP
- Only `SOUL.md` only → **low confidence** — might be CLAUDE.md style, not OpenGAP
- Python imports present alongside the above → detect primary framework first; OpenGAP wraps other frameworks, not replaces them

Report: `Detected format: **OpenGAP** (spec_version: {version}, confidence: high/medium/low)`

---

## 2. Agent Inventory Extraction

Read `agent.yaml` and extract:

| CIR Field | Source in agent.yaml | Notes |
|-----------|---------------------|-------|
| Name | `name` | kebab-case identifier |
| Version | `version` | semver string |
| Description | `description` | one-line purpose |
| Model | `model.preferred` | primary model ID |
| Fallback Models | `model.fallback[]` | ordered list |
| Temperature | `model.constraints.temperature` | if specified |
| Max Tokens | `model.constraints.max_tokens` | if specified |
| Skills | `skills[]` | list of skill folder names |
| Tools | `tools[]` | list of tool file names (no .yaml) |
| Max Turns | `runtime.max_turns` | conversation limit |
| Timeout | `runtime.timeout` | seconds |
| Parent Agent | `extends` | URL or path of parent agent |
| Sub-agents | `agents.*` | map of sub-agent names to config |
| Delegation Mode | `delegation.mode` | auto / explicit / router |

---

## 3. SOUL.md → Role / Purpose / Instructions

`SOUL.md` is the system prompt equivalent. Extract:

| CIR Field | Source in SOUL.md |
|-----------|------------------|
| Role / Identity | `## Core Identity` section |
| Purpose | `## Purpose` section (if present) |
| Instructions | All body text — treat the entire file as the agent's instructions |
| Communication Style | `## Communication Style` section |
| Values & Principles | `## Values & Principles` section |
| Domain Expertise | `## Domain Expertise` section |
| Collaboration Style | `## Collaboration Style` section |

> Quote SOUL.md sections verbatim — do not paraphrase. These are the agent's actual instructions.

---

## 4. RULES.md → Behavioral Constraints

If `RULES.md` exists, extract constraints:

| CIR Field | Source in RULES.md |
|-----------|-------------------|
| Must-always rules | `## Must Always` section |
| Must-never rules | `## Must Never` section |
| Output constraints | `## Output Constraints` section |
| Interaction boundaries | `## Interaction Boundaries` section |

These map to the CIR **State Schema → Constraints** field during translation.

---

## 5. Skills → Capability Inventory

For each skill folder listed in `agent.yaml` `skills[]`:

1. Read `skills/<name>/SKILL.md`
2. Extract from frontmatter:
   - `name` — skill identifier
   - `description` — when this skill is used (routing trigger)
   - `allowed-tools` — space-separated list of tool names this skill can call
3. Extract body text as the skill's instructions/procedure
4. List any files in `skills/<name>/references/` as supporting knowledge

| CIR Field | Source |
|-----------|--------|
| Capability Name | frontmatter `name` |
| Trigger Condition | frontmatter `description` |
| Allowed Tools | frontmatter `allowed-tools` |
| Instructions | SKILL.md body (after frontmatter) |
| Reference Docs | `skills/<name>/references/` files |

---

## 6. Tools → Tool Inventory

For each tool listed in `agent.yaml` `tools[]`, read `tools/<name>.yaml`:

| CIR Field | Source in tool YAML |
|-----------|-------------------|
| Tool Name | `name` |
| Description | `description` |
| Parameters | `input_schema.properties` |
| Required Params | `input_schema.required[]` |
| Return Type | `output_schema` |
| Implementation Type | `implementation.type` (script / mcp / inline) |
| Implementation Path | `implementation.path` |
| Runtime | `implementation.runtime` |
| External | `annotations.read_only`, presence of API calls in implementation |
| Confirmation Required | `annotations.requires_confirmation` |

---

## 7. Knowledge → Knowledge Base

If `knowledge/` exists, read `knowledge/index.yaml`:

```
documents:
  - path: <filename>
    tags: [...]
    priority: high / medium / low
    always_load: true / false
```

For each entry:
- `always_load: true` → inject into every context (treat as global memory)
- `always_load: false` → on-demand reference document

Read each referenced document and include its content in the CIR knowledge base.

---

## 8. Hooks → Lifecycle Events

If `hooks/hooks.yaml` exists, extract the hook event table:

| Hook Event | CIR Equivalent |
|------------|---------------|
| `on_session_start` | Initialization callback |
| `pre_tool_use` | Pre-tool hook / guardrail |
| `post_tool_use` | Post-tool hook / validation |
| `pre_response` | Response filter / compliance check |
| `post_response` | Audit / logging callback |
| `on_error` | Error escalation handler |
| `on_session_end` | Cleanup / finalization callback |

Note: hooks are shell scripts — record the script path and description.

---

## 9. Orchestration Graph

Reconstruct the agent's orchestration from:

1. **`agents/` directory** — each subfolder is a sub-agent; read its `agent.yaml` + `SOUL.md`
2. **`delegation.mode` in agent.yaml**:
   - `auto` → LLM decides when to delegate; draw as conditional edges to each sub-agent
   - `explicit` → user explicitly triggers sub-agent; draw as optional branches
   - `router` → a router agent directs flow; identify the router from `delegation.router`
3. **`workflows/*.yaml`** — each workflow is a deterministic step sequence; extract `steps[].depends_on` for the DAG
4. **`agents.*.delegation.triggers`** — extract trigger conditions for sub-agent delegation

**ASCII diagram pattern for OpenGAP:**
```
[SOUL.md — main agent]
    |
    ├── [skill: analyze] ──── tools: [read, grep, web-search]
    ├── [skill: translate] ── tools: [read, write, bash]
    └── [sub-agent: fact-checker] ← delegation: auto, trigger: factual_claim
```

---

## 10. Full CIR Extraction Steps (OpenGAP)

1. **Detect** — confirm `agent.yaml` + `SOUL.md` present; read `spec_version`
2. **Read agent.yaml** — extract agent inventory (name, model, skills, tools, agents, delegation)
3. **Read SOUL.md** — extract role, instructions, values verbatim
4. **Read RULES.md** (if present) — extract behavioral constraints
5. **Inventory skills** — for each skill in `skills[]`, read SKILL.md and references
6. **Inventory tools** — for each tool in `tools[]`, read tool YAML
7. **Map orchestration** — reconstruct flow from `agents/`, `delegation.mode`, `workflows/`
8. **Extract knowledge** — read `knowledge/index.yaml` and listed documents
9. **Note hooks** — list lifecycle hooks from `hooks/hooks.yaml` if present
10. **Present CIR** — output the complete Analysis Report, then ask user to confirm before proceeding to translation

---

## 11. Mapping Notes (translating OUT of OpenGAP)

When OpenGAP is the **source** and another framework is the **target**:

| OpenGAP concept | Maps to (target) |
|----------------|-----------------|
| `SOUL.md` (Core Identity + Values) | System prompt / `instructions` / `role` + `backstory` |
| `RULES.md` (Must Always/Never) | Guardrails, system prompt addenda, or hardcoded checks |
| `skills/<name>/SKILL.md` | Agent capability, node function, or sub-agent |
| `tools/<name>.yaml` | `@tool` / `@function_tool` / `@kernel_function` decorated function |
| `knowledge/` documents | Vector store, `DocumentStore`, or context injection |
| `hooks/hooks.yaml` | Lifecycle callbacks, middleware, or framework-specific hooks |
| `agents/<name>/` sub-agent | Handoff target, crew agent, sub-graph, or `sub_agents` entry |
| `workflows/*.yaml` | Sequential chain, crew flow, or LangGraph graph |
| `delegation.mode: auto` | LLM-based routing / `Process.hierarchical` / `handoff()` |
| `memory/MEMORY.md` | Conversation history, `TeachableAgent`, or persistent memory store |
| `compliance/` | Audit logging, guardrails, or manual compliance checks |
