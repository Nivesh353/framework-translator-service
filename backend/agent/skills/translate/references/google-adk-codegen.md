# Google ADK Code Generation Reference

> Target: google-adk >= 1.x (2025-2026 API)

---

## 1. Required Imports

```python
# Core agents
from google.adk.agents import Agent
from google.adk.agents import SequentialAgent, ParallelAgent, LoopAgent

# Tools
from google.adk.tools import google_search
from google.adk.tools import AgentTool

# Sessions
from google.adk.sessions import InMemorySessionService

# Memory
from google.adk.memory import InMemoryMemoryService

# Runner
from google.adk.runners import Runner

# Models (non-Gemini)
from google.adk.models.lite_llm import LiteLlm

# Event types
from google.genai import types
```

---

## 2. Agent Template

```python
agent = Agent(
    name="research_assistant",
    model="gemini-2.5-flash",
    instruction="You are a helpful research assistant. Answer user questions thoroughly.",
    tools=[google_search],
    description="Answers research questions using web search.",
)
```

Key rules:
- `name` must be unique across all agents in the hierarchy.
- `instruction` is the system prompt. Supports `{var}` state interpolation.
- `description` is used by parent agents when deciding to delegate.
- `output_key` stores the agent's final output in session state.

---

## 3. Model Templates

```python
# Gemini (default — pass as string)
agent_gemini = Agent(model="gemini-2.5-flash", ...)
agent_gemini_pro = Agent(model="gemini-2.5-pro", ...)

# OpenAI via LiteLlm
agent_openai = Agent(model=LiteLlm(model="openai/gpt-4o"), ...)

# Anthropic via LiteLlm
agent_claude = Agent(model=LiteLlm(model="anthropic/claude-sonnet-4-20250514"), ...)

# Ollama (local) via LiteLlm
agent_local = Agent(model=LiteLlm(model="ollama/llama3.2"), ...)
```

### Generation config

```python
from google.genai import types

agent = Agent(
    model="gemini-2.5-flash",
    generate_content_config=types.GenerateContentConfig(
        temperature=0.2,
        max_output_tokens=4096,
        top_p=0.9,
    ),
    ...
)
```

---

## 4. Tool Templates

### Function Tool (plain function — auto-wrapped)

```python
def get_weather(city: str) -> str:
    """Get the current weather for a city.

    Args:
        city: The city name to look up weather for.
    """
    return f"Weather in {city}: 72F, sunny"

agent = Agent(
    model="gemini-2.5-flash",
    tools=[get_weather],
    ...
)
```

### Tool with state access (via tool_context)

```python
def save_note(note: str, tool_context) -> str:
    """Save a note to the session state.

    Args:
        note: The note content to save.
    """
    notes = tool_context.state.get("notes", [])
    notes.append(note)
    tool_context.state["notes"] = notes
    return f"Note saved. Total notes: {len(notes)}"
```

### AgentTool (wrap agent as tool)

```python
from google.adk.tools import AgentTool

specialist = Agent(
    name="math_specialist",
    model="gemini-2.5-flash",
    instruction="You solve math problems step by step.",
)

main_agent = Agent(
    model="gemini-2.5-flash",
    tools=[AgentTool(agent=specialist)],
    instruction="Use the math specialist for calculations.",
)
```

### Built-in tools

```python
from google.adk.tools import google_search, code_execution

agent = Agent(
    model="gemini-2.5-flash",
    tools=[google_search, code_execution],
    ...
)
```

---

## 5. Workflow Agent Templates

### SequentialAgent (ordered pipeline)

```python
step1 = Agent(
    name="fetcher",
    model="gemini-2.5-flash",
    instruction="Fetch information about {topic}.",
    output_key="fetched_data",
)

step2 = Agent(
    name="processor",
    model="gemini-2.5-flash",
    instruction="Process and summarize this data: {fetched_data}",
    output_key="processed_result",
)

pipeline = SequentialAgent(
    name="research_pipeline",
    sub_agents=[step1, step2],
)
```

Data flows via `output_key` → `{var}` interpolation in the next agent's instruction.

### ParallelAgent (concurrent execution)

```python
weather_agent = Agent(
    name="weather_fetcher",
    model="gemini-2.5-flash",
    instruction="Get the weather for {city}.",
    output_key="weather_data",
)

news_agent = Agent(
    name="news_fetcher",
    model="gemini-2.5-flash",
    instruction="Get latest news about {city}.",
    output_key="news_data",
)

gatherer = ParallelAgent(
    name="info_gatherer",
    sub_agents=[weather_agent, news_agent],
)
```

### LoopAgent (iterative refinement)

```python
drafter = Agent(
    name="drafter",
    model="gemini-2.5-flash",
    instruction="Write a draft about {topic}. Previous feedback: {feedback}",
    output_key="draft",
)

reviewer = Agent(
    name="reviewer",
    model="gemini-2.5-flash",
    instruction="Review this draft: {draft}. If acceptable, say DONE. Otherwise provide feedback.",
    output_key="feedback",
)

refiner = LoopAgent(
    name="refinement_loop",
    sub_agents=[drafter, reviewer],
    max_iterations=5,
)
```

### Nested workflow

```python
# Parallel gather → Sequential process → Report
gather = ParallelAgent(name="gather", sub_agents=[weather_agent, news_agent])
process = SequentialAgent(name="process", sub_agents=[gather, analyzer])
full = SequentialAgent(name="full_pipeline", sub_agents=[process, reporter])
```

---

## 6. Multi-Agent Delegation Template

```python
greeter = Agent(
    name="greeter",
    model="gemini-2.5-flash",
    instruction="You greet users warmly and help with introductions.",
    description="Handles greetings and casual conversation.",
)

researcher = Agent(
    name="researcher",
    model="gemini-2.5-flash",
    instruction="You research topics thoroughly using search.",
    description="Handles research and fact-finding requests.",
    tools=[google_search],
)

writer = Agent(
    name="writer",
    model="gemini-2.5-flash",
    instruction="You write clear, engaging content based on research.",
    description="Handles writing and content creation requests.",
)

coordinator = Agent(
    name="coordinator",
    model="gemini-2.5-flash",
    instruction="You coordinate user requests. Route to the right specialist based on what the user needs.",
    sub_agents=[greeter, researcher, writer],
)
```

The coordinator's LLM reads each sub-agent's `description` to decide delegation.

---

## 7. State & Session Template

```python
from google.adk.sessions import InMemorySessionService

session_service = InMemorySessionService()

# Create session with initial state
session = await session_service.create_session(
    app_name="my_app",
    user_id="user-123",
    state={"user_name": "Alice", "topic": "AI agents"},
)

# Agent instructions read from state via {var}
agent = Agent(
    name="assistant",
    model="gemini-2.5-flash",
    instruction="You are helping {user_name} learn about {topic}.",
    ...
)

# Tools read/write state via tool_context
def update_topic(new_topic: str, tool_context) -> str:
    """Update the research topic."""
    tool_context.state["topic"] = new_topic
    return f"Topic updated to: {new_topic}"
```

---

## 8. Memory Template

```python
from google.adk.memory import InMemoryMemoryService

memory_service = InMemoryMemoryService()

runner = Runner(
    agent=agent,
    app_name="my_app",
    session_service=session_service,
    memory_service=memory_service,
)
```

Memory provides cross-session searchable knowledge. The agent automatically queries memory for relevant context from past sessions.

---

## 9. Runner & Entry Point Template

```python
import asyncio
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

async def main():
    session_service = InMemorySessionService()
    runner = Runner(
        agent=agent,
        app_name="my_app",
        session_service=session_service,
    )

    # Create a session
    session = await session_service.create_session(
        app_name="my_app",
        user_id="user-123",
    )

    # Send a message
    user_message = types.Content(
        role="user",
        parts=[types.Part(text="Hello, help me with research")],
    )

    response = await runner.run_async(
        session_id=session.id,
        user_id="user-123",
        new_message=user_message,
    )

    # Process response events
    async for event in response:
        if event.content and event.content.parts:
            print(event.content.parts[0].text)

asyncio.run(main())
```

---

## 10. Complete Minimal Example

```python
import asyncio
from google.adk.agents import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types


def get_weather(city: str) -> str:
    """Get the current weather for a city.

    Args:
        city: The city name to look up.
    """
    return f"The weather in {city} is sunny, 72F."


agent = Agent(
    name="weather_assistant",
    model="gemini-2.5-flash",
    instruction="You are a helpful weather assistant. Use the get_weather tool to answer weather questions.",
    tools=[get_weather],
)


async def main():
    session_service = InMemorySessionService()
    runner = Runner(
        agent=agent,
        app_name="weather_app",
        session_service=session_service,
    )

    session = await session_service.create_session(
        app_name="weather_app",
        user_id="user-1",
    )

    user_message = types.Content(
        role="user",
        parts=[types.Part(text="What's the weather in Paris?")],
    )

    response = await runner.run_async(
        session_id=session.id,
        user_id="user-1",
        new_message=user_message,
    )

    async for event in response:
        if event.content and event.content.parts:
            print(event.content.parts[0].text)


if __name__ == "__main__":
    asyncio.run(main())
```

---

## 11. Common Pitfalls

| Pitfall | Fix |
|---|---|
| Using `instructions` (plural) instead of `instruction` | ADK uses `instruction` (singular) — not `instructions` |
| Missing `name` on agent | Every agent requires a unique `name` parameter |
| Duplicate agent names in hierarchy | Names must be unique across all agents in the tree |
| Using f-strings instead of `{var}` for state interpolation | ADK resolves `{var}` from session state at runtime; f-strings resolve at definition time |
| Forgetting `tool_context` parameter in tools that access state | Add `tool_context` as the last parameter — ADK injects it automatically |
| Missing `await` on `runner.run_async()` | Runner methods are async; must be awaited |
| Missing `async for` when iterating response events | `run_async` returns an async iterator |
| `AgentTool` circular reference | Agent A has AgentTool(B) and B has AgentTool(A) — causes infinite delegation |
| Non-Gemini model without `LiteLlm` wrapper | Non-Google models must use `LiteLlm(model="provider/model")` |
| Missing `output_key` in sequential pipeline | Without `output_key`, agent output is not stored in state for the next agent |
| `description` missing on sub-agents | Parent LlmAgent uses `description` to decide delegation; without it, delegation fails |
| Forgetting to create session before running | `runner.run_async()` requires a valid `session_id` |
