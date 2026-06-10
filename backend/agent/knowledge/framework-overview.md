# Framework Detection & Overview

## Quick Detection Table

Use these signals to auto-detect the source framework:

| Framework | Primary Import Signal | Secondary Signals | File Patterns |
|-----------|----------------------|-------------------|---------------|
| **LangGraph** | `from langgraph.graph import StateGraph` | `add_node`, `add_edge`, `add_conditional_edges`, `START`, `END`, `MessageGraph` | `*.py` with `graph.compile()` |
| **CrewAI** | `from crewai import Agent, Task, Crew` | `@agent`, `@task`, `@crew`, `Process`, `CrewBase`, `kickoff()` | `agents.yaml`, `tasks.yaml`, `crew.py` |
| **OpenAI Agents SDK** | `from agents import Agent, Runner` | `@function_tool`, `handoff()`, `GuardrailFunctionOutput`, `RunContext` | `*.py` with `Runner.run()` |
| **AutoGen** | `from autogen import` | `AssistantAgent`, `UserProxyAgent`, `ConversableAgent`, `GroupChat`, `GroupChatManager` | `OAI_CONFIG_LIST` |
| **Semantic Kernel** | `import semantic_kernel` | `@kernel_function`, `Kernel()`, `add_plugin`, `KernelArguments`, `ChatCompletionClientBase` | `*.py` with `kernel.invoke()` |
| **Haystack** | `from haystack import Pipeline` | `@component`, `pipeline.connect()`, `pipeline.run()`, `DocumentStore`, `PromptBuilder` | `*.py` with Pipeline DAG |
| **Agno** | `from agno.agent import Agent` | `from agno.models.*`, `from agno.tools.*`, `Team`, `Workflow`, `Storage` | `*.py` with `agent.run()` |
| **Phidata** (legacy Agno) | `from phi.agent import Agent` | `from phi.model.*`, `from phi.tools.*`, `Playground` | `*.py` with `agent.print_response()` |
| **Google ADK** | `from google.adk.agents import Agent` | `SequentialAgent`, `ParallelAgent`, `LoopAgent`, `Runner`, `sub_agents=`, `model="gemini-"` | `*.py` with `Runner(agent=...)` |
| **Lyzr ADK** | `from lyzr import Studio` | `Studio()`, `create_agent(role=, goal=, instructions=)`, `add_tool(`, `agent.run(...).response`, `knowledge_bases=`, `session_id=`, `provider="openai/gpt-4o"` | `lyzr-adk` in deps |
| **OpenGAP** | *(no Python imports — file-based)* | `agent.yaml` with `spec_version: "0.1.0"`, `SOUL.md` at root | `agent.yaml` + `SOUL.md` present; `skills/`, `tools/`, `hooks/` dirs |

## Framework Paradigm Summary

| Framework | Paradigm | Complexity | Multi-Agent Style | Best For |
|-----------|----------|------------|-------------------|----------|
| **LangGraph** | Graph-based (nodes + edges) | High | Sub-graphs, conditional routing | Complex stateful workflows with cycles |
| **CrewAI** | Role-based (agents in a crew) | Low | Crew with delegation | Fast multi-agent prototyping |
| **OpenAI Agents SDK** | Function-based (agents + handoffs) | Low | Handoff chain | OpenAI-native lightweight agents |
| **AutoGen** | Conversation-based (chat between agents) | Medium | GroupChat, nested chat | Multi-party agent discussions |
| **Semantic Kernel** | Plugin-based (kernel + functions) | Medium | Multiple plugins on kernel | Enterprise integration (.NET/Java/Python) |
| **Haystack** | Pipeline-based (components + connections) | Medium | Pipeline branching | RAG and document processing |
| **Agno** | Declarative (agent + tools + team) | Low | Teams and workflows | Quick agent setup, model-agnostic |
| **Google ADK** | Agent-based (LLM + workflow agents) | Medium | sub_agents with LLM delegation | Google-native agents, multi-agent orchestration |
| **Lyzr ADK** | Declarative (studio + agent + tools) | Low | Multiple agents on one studio | Quick agents with built-in RAG, memory & guardrails |
| **OpenGAP** | File-structure / git-native | Low | `agents/` sub-folders + `delegation.mode` | Portable, version-controlled, framework-agnostic agents |

## Key Structural Differences

### Agent Definition
- **LangGraph**: Agents are Python functions (nodes) that take state and return state updates. No "agent object."
- **CrewAI**: Agents are objects with `role`, `goal`, and `backstory` strings. Rich personality model.
- **OpenAI Agents SDK**: Agents are objects with `name`, `instructions`, and `tools`. Minimal.
- **AutoGen**: Agents are objects with `system_message` and registered functions. Chat-oriented.
- **Semantic Kernel**: No explicit "agent" — a Kernel with plugins provides capabilities. Agent Framework layer adds multi-agent.
- **Haystack**: No "agent" — components in a pipeline. Each component has `run()` method with typed I/O.
- **Lyzr ADK**: Agents are objects created via `studio.create_agent(role, goal, instructions)`. Tools are plain functions added with `add_tool()` (no decorator). RAG (`knowledge_bases`), memory (`session_id`), and guardrails (RAI) are built in. Replies read from `response.response`.
- **Agno**: Agent objects with `model`, `instructions`, `tools`. Most similar to OpenAI SDK structure.
- **Google ADK**: `Agent`/`LlmAgent` with `model`, `instruction`, `tools`, `sub_agents`. Workflow agents (`SequentialAgent`, `ParallelAgent`, `LoopAgent`) for deterministic orchestration without LLMs.
- **OpenGAP**: No Python "agent object." Identity is defined in `SOUL.md` (system prompt equivalent). Capabilities are in `skills/<name>/SKILL.md`. The `agent.yaml` manifest wires together model, skills, tools, and sub-agents declaratively.

### Orchestration Model
- **LangGraph**: Explicit graph — you define every edge. Supports cycles (loops). Most control.
- **CrewAI**: Process types — sequential (ordered) or hierarchical (manager delegates). Less control, more abstraction.
- **OpenAI Agents SDK**: Handoff pattern — agents transfer control to other agents. Linear with branching.
- **AutoGen**: GroupChat — agents take turns speaking based on speaker selection. Conversational flow.
- **Semantic Kernel**: Planner or manual chaining — kernel invokes functions in sequence or via AI planning.
- **Haystack**: DAG pipeline — components connected via `pipeline.connect()`. No cycles (acyclic).
- **Agno**: Team/Workflow — agents collaborate in teams or follow workflow steps.
- **Google ADK**: Hybrid — LLM agents delegate to sub_agents via LLM decision; workflow agents (`SequentialAgent`, `ParallelAgent`, `LoopAgent`) provide deterministic control flow.
- **OpenGAP**: `delegation.mode` in `agent.yaml` controls routing (`auto` = LLM decides, `explicit` = user triggers, `router` = dedicated router agent). `workflows/*.yaml` for deterministic multi-step sequences. `agents/` sub-folders for sub-agents.

### Tool Registration
- **LangGraph**: Tools are regular functions called inside nodes. Or use `ToolNode` for LLM tool-calling.
- **CrewAI**: `@tool` decorator or pass tool objects to Agent constructor.
- **OpenAI Agents SDK**: `@function_tool` decorator. Tools are functions with type-annotated params.
- **AutoGen**: `register_function()` on agent, or `@register_function` decorator.
- **Semantic Kernel**: `@kernel_function` decorator on plugin class methods.
- **Haystack**: Tools are `@component` classes with a `run()` method. Not function-level.
- **Agno**: Pass functions or Toolkit objects to Agent constructor.
- **Google ADK**: Plain functions (auto-wrapped via docstring), `BaseTool` subclass, `AgentTool` (agent-as-tool), OpenAPI specs, MCP tools.
- **OpenGAP**: Declarative YAML (`tools/<name>.yaml`) for tool interface definition. Implementation lives in a companion script (`tools/<name>.py`). MCP servers can also be declared in `agent.yaml` under `mcp_servers`.
