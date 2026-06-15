# Lyzr ADK Code Generation Reference

> Target: `lyzr-adk` >= 0.1.x (2026 API). Install: `pip install lyzr-adk`.
> Import surface is `from lyzr import Studio`.

Generate idiomatic Lyzr ADK code from the CIR. Lyzr ADK is declarative and
studio-managed — a `Studio` owns agents, tools, knowledge bases (RAG), memory,
and guardrails.

---

## 1. Required Imports

```python
from lyzr import Studio          # the only import you usually need
# (optional) from pydantic import BaseModel   # for structured outputs
```

## 2. Minimal Agent

> **Single-script exception, but still foldered.** Lyzr ADK is a one-shot agent-*creation* script, so a single `create_agents.py` is acceptable — but wrap it in a project folder with `tools.py` (if any), `requirements.txt`, `.env.example`, and `README.md` per **Step 6** of the translate skill. Do not emit a bare `.py` file.

`Studio()` authenticates with a Lyzr API key: pass `Studio(api_key="sk-...")` or set
the `LYZR_API_KEY` environment variable (Studio reads it automatically). A missing or
invalid key raises `AuthenticationError`. **Never** hardcode the key into the generated
file — rely on the env var (see §10).

```python
from lyzr import Studio

studio = Studio()                    # reads LYZR_API_KEY from env (do NOT inline the key)
agent = studio.create_agent(
    name="<agent name>",
    provider="openai/gpt-4o",        # "<provider>/<model>"; map from CIR model
    role="<persona / role>",         # from CIR role
    goal="<what it should achieve>", # from CIR goal
    instructions="<system prompt>",  # from CIR system instructions
)

response = agent.run("<user message>")
print(response.response)             # the text reply is response.response
```

## 3. Tools (no decorators)

Map each CIR tool to a plain Python function whose **docstring is the description**,
then register it with `add_tool`:

```python
def get_weather(city: str) -> dict:
    """Return the current weather for a city."""   # description for the LLM
    ...
    return {"temp_c": 21, "summary": "clear"}

agent.add_tool(get_weather)          # no @tool / @function_tool decorator needed
```

When translating FROM a decorator-based framework, strip the decorator and keep the
function + docstring + type hints.

## 4. RAG / Knowledge bases

```python
kb = studio.create_knowledge_base(name="docs")   # ingest documents into it
# ... add documents to kb ...
response = agent.run("Answer from the docs", knowledge_bases=[kb])
```

## 5. Memory (conversation context)

Pass a `session_id` so the agent remembers across turns:

```python
agent.run("Remember my name is Sam", session_id="user_123")
agent.run("What's my name?",         session_id="user_123")  # recalls "Sam"
```

## 6. Structured outputs

```python
from pydantic import BaseModel

class Ticket(BaseModel):
    summary: str
    priority: str

# pass the model so the agent returns a typed object
response = agent.run("Classify this issue: ...", response_model=Ticket)
```

## 7. Guardrails (RAI)

Lyzr ADK supports safety policies (toxicity, PII, secrets detection). Map any
CIR guardrails/compliance to the studio/agent's RAI policy configuration.

## 8. Multi-agent

Create multiple agents on the same studio and orchestrate between them:

```python
researcher = studio.create_agent(name="Researcher", provider="openai/gpt-4o",
                                 role="Researcher", goal="Gather facts", instructions="...")
writer     = studio.create_agent(name="Writer", provider="openai/gpt-4o",
                                 role="Writer", goal="Write the report", instructions="...")
facts  = researcher.run("Research X").response
report = writer.run(f"Write a report from: {facts}").response
```

## 9. Translation checklist (target = Lyzr ADK)

- [ ] One `Studio()` instance; one `create_agent(...)` per CIR agent.
- [ ] `role` / `goal` / `instructions` filled from the CIR persona/system prompt.
- [ ] Every CIR tool → plain function (+ docstring) + `agent.add_tool(...)`.
- [ ] CIR RAG → `knowledge_bases=[...]`; CIR memory → `session_id=`.
- [ ] CIR structured output → Pydantic `response_model`.
- [ ] Read replies via `response.response`.
- [ ] `provider` string composed as `"<provider>/<model>"` from the CIR model.
- [ ] If a Lyzr ADK feature has no source equivalent, omit it (don't invent); note unknowns and verify the API via web search before emitting.
- [ ] After generating, **create the agents live** — see §10. A Lyzr ADK translation is not "done" until the agents exist in the user's Lyzr workspace.

## 10. Provisioning — actually create the agents (run the code)

Lyzr ADK is a **hosted platform**, not a local library: `studio.create_agent(...)`
performs a real `POST /v3/agents/` and registers the agent in the user's Lyzr
workspace. The returned `Agent` has a live `.id`. So the translation is only
complete once the generated code has been run against the user's account.

**Ground truth (lyzr-adk 0.1.x):**
- Auth: `Studio(api_key="sk-...")` **or** `LYZR_API_KEY` env var. Missing/invalid → `AuthenticationError`.
- `studio.create_agent(name, provider, role, goal, instructions, ...)` → `POST /v3/agents/` → `Agent` with `.id` (the live agent id).
- `agent.add_tool(fn)` attaches a local tool (bare callable works; `@tool` from `from lyzr import tool` optional).
- `agent.run(msg, session_id=..., response_model=...).response` → the text reply (use for a smoke-test turn).

**Procedure (do this after Step 6 of the translate skill):**

1. **Ask the user for their Lyzr API key — always.** Do not create anything without
   it. Tell them where to find it (`https://studio.lyzr.ai` → Settings → API Keys) and
   let them decline with "skip" to keep code-only.
2. **Never hardcode/echo/commit the key.** Export it for this run only; `Studio()`
   picks it up from the environment:
   ```bash
   export LYZR_API_KEY="<key the user pasted>"
   # lyzr-adk is PRE-INSTALLED in the sandbox's system Python — do NOT reinstall it
   # (it's at /usr/local/lib/python3*/dist-packages). Install only if import fails:
   python3 -c "import lyzr" 2>/dev/null || pip install --user -q lyzr-adk
   python3 create_agents.py
   ```
3. **Make the script print each created agent's name + id** so the user can find them:
   ```python
   import os
   from lyzr import Studio

   studio = Studio()  # reads LYZR_API_KEY from env
   agent = studio.create_agent(
       name="Support Bot", provider="openai/gpt-4o",
       role="...", goal="...", instructions="...",
   )
   # agent.add_tool(get_weather)   # one per CIR tool
   print(f"✅ Created {agent.name}  id={agent.id}")
   ```
4. **Run it, capture the printed IDs, and report** that the agents are now live in
   the user's Lyzr Studio workspace (`https://studio.lyzr.ai`), listing each
   `name` → `id`. On `AuthenticationError` ask for a fresh key; on `APIError` /
   `ValidationError` surface the message and the offending field/value.
