---
name: analyze
description: "Analyze and decompose AI agent source code or an OpenGAP agent folder into a Canonical Intermediate Representation (CIR). Detects the source framework automatically and extracts agents, tools, state, orchestration, and memory. Supports 10 frameworks: LangGraph, CrewAI, OpenAI Agents SDK, AutoGen, Semantic Kernel, Haystack, Agno/Phidata, Google ADK, Lyzr ADK, and OpenGAP. Use when the user wants to understand an agent's structure, when beginning a framework translation, or when the user says 'analyze this agent', 'what does this agent do', 'break down this code', 'show me the architecture', 'decompose this agent', 'analyze opengap agent', 'what is in this gitagent', or provides agent code to translate. Triggers on: analyze, understand, decompose, architecture, break down, what does this do, analyze opengap, translate (as first step)."
allowed-tools: "Read, Grep, Glob, Bash, WebSearch, Agent"
metadata:
  version: "1.0.0"
  category: "developer-tools"
---

# Analyze Agent Source Code

Read agent source code written in any of the 10 supported frameworks — or an OpenGAP agent folder — and produce a Canonical Intermediate Representation (CIR).

## Step 1: Detect the Source Framework

Read the source files provided by the user. Identify the framework by matching imports and structural patterns from `knowledge/framework-overview.md`.

Detection priority:
1. **File structure** — highest priority signal: if `agent.yaml` (with `spec_version`) + `SOUL.md` are present at the root, this is **OpenGAP** — stop here, no imports to scan
2. **Import statements** — most reliable signal for code-based frameworks (e.g., `from langgraph.graph import StateGraph`)
3. **Decorators** — secondary signal (e.g., `@function_tool`, `@component`)
4. **File patterns** — tertiary signal (e.g., `agents.yaml` + `tasks.yaml` = CrewAI)
5. **Method calls** — fallback (e.g., `crew.kickoff()`, `pipeline.run()`)

If multiple frameworks are detected (e.g., LangChain + LangGraph), identify the primary orchestration framework.

If uncertain, use **WebSearch** to verify: search for the ambiguous import or pattern to confirm which framework it belongs to.

Report: `Detected framework: **{name}** (confidence: high/medium/low)`

If confidence is low, ask the user to confirm before proceeding.

## Step 2: Load Framework Reference

Read the corresponding reference file for the detected framework:
- `references/opengap-patterns.md` ← **use this for OpenGAP agents (file-structure based)**
- `references/langgraph-patterns.md`
- `references/crewai-patterns.md`
- `references/openai-agents-patterns.md`
- `references/autogen-patterns.md`
- `references/semantic-kernel-patterns.md`
- `references/haystack-patterns.md`
- `references/agno-patterns.md`
- `references/google-adk-patterns.md`
- `references/lyzr-adk-patterns.md`

Load **only** the detected framework's reference file.

## Step 3: Extract the CIR

Read `knowledge/concept-mapping.md` for the CIR schema. Walk through the source code and extract each section:

### 3a: Agent Inventory

For each agent/node/component found, extract:

| Agent | Role/Purpose | Instructions (verbatim) | Model | Tools |
|-------|-------------|------------------------|-------|-------|
| ... | ... | ... | ... | ... |

Quote instructions/system prompts exactly — do not paraphrase.

### 3b: Tool Inventory

For each tool defined or used:

| Tool | Parameters | Return Type | Implementation | External? |
|------|-----------|-------------|----------------|-----------|
| ... | ... | ... | ... | Yes/No |

Include the full function body or describe what it does.

### 3c: State Schema

Document the state structure:
- Field names and types
- Which fields are shared vs. local
- How state is initialized
- Whether state is persisted (checkpointer, database, etc.)

### 3d: Orchestration Graph

Draw an ASCII diagram showing the agent flow:

```
[START] --> [Agent A] --condition1--> [Agent B] --> [END]
                      --condition2--> [Agent C] --> [Agent A] (loop)
```

Document:
- Sequential flows (A → B → C)
- Conditional branches (what conditions, what evaluates them)
- Loops/cycles (which nodes loop back)
- Parallel execution (which steps run concurrently)
- Handoff/delegation patterns

### 3e: Memory Configuration

- Type: conversation history, vector store, key-value, long-term
- Scope: per-agent, shared, global
- Backend: in-memory, database, file

### 3f: External Dependencies

- APIs called (endpoints, auth)
- Databases (connection, queries)
- File I/O (reads, writes)
- Environment variables required
- pip packages needed

## Step 4: Present the CIR

Output the complete CIR as a structured document:

```
## Analysis Report

**Source Framework**: {name} (v{version if detectable})
**Confidence**: high/medium/low

### Architecture Diagram
{ASCII diagram}

### Agent Inventory
{table}

### Tool Inventory
{table}

### State Schema
{description}

### Orchestration Logic
{edges, conditions, loops described in prose + diagram}

### Memory Configuration
{description}

### External Dependencies
{list}

### Translation Notes
{anything unusual or framework-specific that will need special handling}
```

Ask the user to confirm the analysis is correct before proceeding to translation.

## Handling Unknown Patterns

If you encounter a pattern, decorator, or import you do not recognize:

1. **Search first**: Use WebSearch for `"{pattern}" {framework} documentation` or `"{import_path}" python`
2. **Check version**: The pattern may be from a newer version — search for `{framework} changelog {pattern}`
3. **Ask if stuck**: If WebSearch does not resolve it, ask the user what the pattern does
4. **Document it**: Add any unknown patterns to the Translation Notes section of the CIR
