# Lyzr ADK Framework Patterns Reference

Use this reference to identify, decompose, and extract CIR from Lyzr ADK (the Lyzr
Agent Development Kit, `pip install lyzr-adk`) agent code.

---

## 1. Import Fingerprints

Presence of any of these confirms a Lyzr ADK codebase:

```python
from lyzr import Studio                 # primary signal — the entry point
# studio.create_agent(...), agent.add_tool(...), agent.run(...)
```

Secondary signals: `Studio()`, `.create_agent(`, `.add_tool(`, `.run(` returning an
object with a `.response` attribute, `knowledge_bases=[...]`, `session_id=...`,
RAI / guardrail policy config, `provider="openai/gpt-4o"`-style provider strings.

Package / dependency signals: `lyzr-adk` in `requirements.txt` / `pyproject.toml`.

## 2. Core Structure

Lyzr ADK is **declarative + studio-managed**. One `Studio` instance owns agents,
knowledge bases (RAG), memory contexts, and safety policies.

```python
from lyzr import Studio

studio = Studio()
agent = studio.create_agent(
    name="Support Bot",
    provider="openai/gpt-4o",          # "<provider>/<model>" or bare model id
    role="Customer support assistant", # the persona
    goal="Help users with technical questions",
    instructions="Be helpful, concise, and professional",
)

def read_database(query: str) -> dict:  # plain function — no decorator
    """Query the database"""
    return {"results": [...]}

agent.add_tool(read_database)           # tools are added imperatively

response = agent.run(
    "How do I reset my password?",
    knowledge_bases=[kb],               # optional RAG
    session_id="user_123",              # optional memory scope
)
print(response.response)
```

## 3. CIR extraction — what to pull out

| CIR field | Where it lives in Lyzr ADK |
|---|---|
| agent name | `create_agent(name=...)` |
| model / provider | `create_agent(provider="openai/gpt-4o")` → split on `/` |
| role / persona | `create_agent(role=...)` |
| goal | `create_agent(goal=...)` |
| system instructions | `create_agent(instructions=...)` |
| tools | each `agent.add_tool(fn)` → function name, signature, docstring (the docstring IS the tool description) |
| memory | `session_id=` on `run()` → conversation memory keyed by session |
| RAG / knowledge | `knowledge_bases=[...]` + any `studio` knowledge-base ingestion calls |
| guardrails | RAI policies (toxicity / PII / secrets detection) configured on the studio/agent |
| structured output | a Pydantic response model passed to the agent (type-safe outputs) |
| multi-agent | multiple `studio.create_agent(...)` + any orchestration/delegation between them |

## 4. Mapping notes (for translating OUT of Lyzr ADK)

- **Tools**: Lyzr ADK uses bare functions + docstrings (no `@tool` decorator). When
  translating to a decorator-based framework (CrewAI `@tool`, OpenAI `@function_tool`,
  Semantic Kernel `@kernel_function`), wrap each `add_tool` function with that
  framework's decorator and lift the docstring into the description.
- **role + goal + instructions**: collapse into the target's persona/system-prompt
  fields (e.g. CrewAI `role`/`goal`/`backstory`, OpenAI `instructions`, LangGraph
  system message).
- **knowledge_bases**: maps to the target's RAG layer (Haystack DocumentStore,
  LangGraph retriever node, CrewAI knowledge, etc.).
- **session_id memory**: maps to the target's memory/checkpointer (LangGraph
  `MemorySaver`, AutoGen chat history, etc.).
- **provider string** `"openai/gpt-4o"`: split into the target's model config.
