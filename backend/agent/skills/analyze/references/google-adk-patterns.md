# Google ADK Framework Patterns Reference

Use this reference to identify, decompose, and extract CIR from Google ADK (Agent Development Kit) agent code.

---

## 1. Import Fingerprints

Presence of any of these imports confirms a Google ADK codebase:

```python
# Core agents
from google.adk.agents import Agent
from google.adk.agents import LlmAgent
from google.adk.agents import SequentialAgent
from google.adk.agents import ParallelAgent
from google.adk.agents import LoopAgent
from google.adk.agents import BaseAgent

# Tools
from google.adk.tools import BaseTool, FunctionTool
from google.adk.tools import AgentTool
from google.adk.tools import google_search

# Sessions and state
from google.adk.sessions import InMemorySessionService
from google.adk.sessions import DatabaseSessionService

# Memory
from google.adk.memory import InMemoryMemoryService

# Runners
from google.adk.runners import Runner

# Models (non-Gemini via LiteLlm)
from google.adk.models.lite_llm import LiteLlm

# Artifacts
from google.adk.artifacts import InMemoryArtifactService

# Events
from google.genai import types
```

Secondary signals: `model="gemini-2.5-flash"`, `model="gemini-2.5-pro"`, `sub_agents=[...]`, `{var}` template interpolation in `instruction` strings, `Runner(agent=..., app_name=...)`.

---

## 2. Agent Patterns

### LlmAgent / Agent (primary abstraction)

`Agent` is an alias for `LlmAgent`. It wraps a model with instructions, tools, and optional sub-agents.

```python
agent = Agent(
    name="research_assistant",
    model="gemini-2.5-flash",
    instruction="You are a helpful research assistant. Help the user find information about {topic}.",
    tools=[google_search, get_weather],
    sub_agents=[summarizer_agent],
    description="Researches topics and provides summaries.",
    output_key="research_result",
    generate_content_config=types.GenerateContentConfig(
        temperature=0.2,
        max_output_tokens=4096,
    ),
)
```

### Agent parameters
| Parameter | Purpose |
|---|---|
| `name` | Unique agent identifier (required) |
| `model` | Model string like `"gemini-2.5-flash"` or LiteLlm wrapper (required for LlmAgent) |
| `instruction` | System prompt string; supports `{var}` state interpolation |
| `tools` | List of tool functions, BaseTool instances, or AgentTool wrappers |
| `sub_agents` | List of child agents for delegation |
| `description` | Description used by parent agent when deciding to delegate |
| `output_key` | State key where the agent's output is stored |
| `generate_content_config` | Model generation parameters (temperature, max_output_tokens, etc.) |
| `before_agent_callback` | Function called before agent runs |
| `after_agent_callback` | Function called after agent runs |

### SequentialAgent (deterministic pipeline)

Runs sub-agents in order. No LLM involved — pure orchestration.

```python
pipeline = SequentialAgent(
    name="research_pipeline",
    sub_agents=[fetch_agent, process_agent, summarize_agent],
    description="Runs a three-step research pipeline.",
)
```

Data flows between steps via shared session state using `output_key` on each sub-agent.

### ParallelAgent (concurrent execution)

Runs all sub-agents concurrently. Results merge into session state.

```python
gatherer = ParallelAgent(
    name="info_gatherer",
    sub_agents=[weather_agent, news_agent, stock_agent],
    description="Gathers weather, news, and stock data simultaneously.",
)
```

### LoopAgent (iterative execution)

Runs sub-agents in a loop until an exit condition is met.

```python
refiner = LoopAgent(
    name="iterative_refiner",
    sub_agents=[draft_agent, review_agent],
    max_iterations=5,
    description="Iteratively drafts and reviews until quality threshold is met.",
)
```

### Custom BaseAgent

Extend `BaseAgent` for fully custom logic.

```python
from google.adk.agents import BaseAgent

class MyCustomAgent(BaseAgent):
    async def _run_async_impl(self, ctx):
        # Custom orchestration logic
        yield Event(...)
```

### Identification rules
- Look for `Agent(...)` or `LlmAgent(...)` with `model=` and `instruction=` parameters.
- `SequentialAgent`, `ParallelAgent`, `LoopAgent` are workflow agents with `sub_agents=[]`.
- Custom agents extend `BaseAgent` and override `_run_async_impl`.

---

## 3. Model Patterns

### Gemini models (default, via string)

```python
# Gemini models — pass as string directly
agent = Agent(model="gemini-2.5-flash", ...)
agent = Agent(model="gemini-2.5-pro", ...)
agent = Agent(model="gemini-2.0-flash", ...)
```

### Non-Google models (via LiteLlm)

```python
from google.adk.models.lite_llm import LiteLlm

# OpenAI
agent = Agent(model=LiteLlm(model="openai/gpt-4o"), ...)

# Anthropic
agent = Agent(model=LiteLlm(model="anthropic/claude-sonnet-4-20250514"), ...)

# Ollama (local)
agent = Agent(model=LiteLlm(model="ollama/llama3.2"), ...)
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

### Identification
- String model parameter: `model="gemini-*"` — Google Gemini.
- `LiteLlm(model="provider/model")` — non-Google model via LiteLlm proxy.
- `generate_content_config` — model generation parameters.

---

## 4. Tool Patterns

### Plain functions (auto-wrapped)

ADK automatically wraps plain Python functions as tools. The function name becomes the tool name, the docstring becomes the description, and type annotations define the parameter schema.

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

### BaseTool / FunctionTool subclass

```python
from google.adk.tools import BaseTool, FunctionTool

class DatabaseSearch(BaseTool):
    name = "database_search"
    description = "Search the internal database"

    def run_sync(self, *, query: str) -> str:
        return db.search(query)
```

### AgentTool (agent as tool)

Wrap another agent as a tool callable by a parent agent.

```python
from google.adk.tools import AgentTool

specialist = Agent(name="specialist", model="gemini-2.5-flash", instruction="...")

coordinator = Agent(
    model="gemini-2.5-flash",
    tools=[AgentTool(agent=specialist)],
    instruction="Use the specialist tool when you need domain expertise.",
)
```

### Built-in tools

```python
from google.adk.tools import google_search
from google.adk.tools import code_execution

agent = Agent(tools=[google_search, code_execution], ...)
```

### MCP tools

```python
from google.adk.tools.mcp_tool import MCPToolset

mcp_tools = MCPToolset(server_params={"url": "http://localhost:3000"})
agent = Agent(tools=[mcp_tools], ...)
```

### Identification
- Plain functions in `tools=[...]` — auto-wrapped by ADK.
- `BaseTool` / `FunctionTool` subclasses.
- `AgentTool(agent=...)` — agent wrapped as tool.
- `google_search`, `code_execution` — built-in ADK tools.
- `MCPToolset` — MCP server integration.

---

## 5. Multi-Agent Patterns

### LLM-driven delegation (sub_agents)

The parent LlmAgent uses its LLM to decide which sub-agent to call based on descriptions.

```python
greeter = Agent(
    name="greeter",
    model="gemini-2.5-flash",
    instruction="You greet users warmly.",
    description="Handles greetings and introductions.",
)

researcher = Agent(
    name="researcher",
    model="gemini-2.5-flash",
    instruction="You research topics thoroughly.",
    description="Handles research requests.",
    tools=[google_search],
)

coordinator = Agent(
    name="coordinator",
    model="gemini-2.5-flash",
    instruction="You coordinate user requests to the right specialist.",
    sub_agents=[greeter, researcher],
)
```

### Workflow-based multi-agent

```python
# Sequential pipeline
pipeline = SequentialAgent(
    name="content_pipeline",
    sub_agents=[researcher, writer, editor],
)

# Parallel fan-out
gatherer = ParallelAgent(
    name="data_gatherer",
    sub_agents=[weather_agent, news_agent],
)

# Hybrid: parallel gather then sequential process
full_pipeline = SequentialAgent(
    name="full_pipeline",
    sub_agents=[gatherer, analyzer, reporter],
)
```

### Identification
- `sub_agents=[...]` on an `Agent` — LLM-driven delegation.
- `SequentialAgent`, `ParallelAgent`, `LoopAgent` with `sub_agents` — workflow orchestration.
- Nested combinations (workflow agents containing other workflow agents or LLM agents).

---

## 6. State & Session Patterns

### Session-scoped state

State is managed per session via the session service. Agents read/write state as key-value pairs.

```python
from google.adk.sessions import InMemorySessionService

session_service = InMemorySessionService()

# State is accessed in tools via tool_context
def save_preference(preference: str, tool_context) -> str:
    """Save a user preference."""
    tool_context.state["user_preference"] = preference
    return f"Saved preference: {preference}"
```

### Template interpolation in instructions

Agent instructions support `{key}` placeholders that are resolved from session state at runtime.

```python
agent = Agent(
    name="personalized_assistant",
    model="gemini-2.5-flash",
    instruction="You are helping {user_name}. Their preference is {user_preference}.",
    ...
)
```

### State sharing between sequential agents

```python
step1 = Agent(
    name="fetcher",
    model="gemini-2.5-flash",
    instruction="Fetch data about {topic}.",
    output_key="fetched_data",       # writes output to state["fetched_data"]
)

step2 = Agent(
    name="processor",
    model="gemini-2.5-flash",
    instruction="Process this data: {fetched_data}",   # reads from state
)

pipeline = SequentialAgent(name="pipeline", sub_agents=[step1, step2])
```

### Session service backends

```python
# In-memory (development)
session_service = InMemorySessionService()

# Database (production)
from google.adk.sessions import DatabaseSessionService
session_service = DatabaseSessionService(db_url="postgresql://...")
```

### Identification
- `tool_context.state[...]` — state access in tools.
- `{var}` in `instruction` strings — template interpolation.
- `output_key=` on agents — state output binding.
- `InMemorySessionService` / `DatabaseSessionService` — session backends.

---

## 7. Memory Patterns

Memory provides cross-session searchable knowledge (distinct from session state).

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

### Identification
- `InMemoryMemoryService` — development memory.
- `memory_service=` on Runner — memory backend.
- Memory is cross-session; state is per-session.

---

## 8. Runner & Execution Patterns

### Runner setup

```python
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService

runner = Runner(
    agent=agent,
    app_name="my_app",
    session_service=InMemorySessionService(),
)
```

### Running an agent

```python
from google.genai import types

# Create a session
session = await session_service.create_session(app_name="my_app", user_id="user-123")

# Run with a user message
response = await runner.run_async(
    session_id=session.id,
    user_id="user-123",
    new_message=types.Content(
        role="user",
        parts=[types.Part(text="Hello, help me with research")],
    ),
)

# Process events
async for event in response:
    if event.content and event.content.parts:
        print(event.content.parts[0].text)
```

### ADK dev server (web UI)

```python
# In __main__.py or app.py
from google.adk.cli import cli
cli.main()
# Then run: adk web
```

### Identification
- `Runner(agent=..., app_name=..., session_service=...)` — execution setup.
- `runner.run_async(session_id, user_id, new_message)` — invocation.
- `adk web` — dev server command.

---

## 9. Common Architectures

### Single LLM agent with tools

```
[User] --> [Agent + tools] --> [Response]
```

```python
agent = Agent(name="assistant", model="gemini-2.5-flash", tools=[search, calc])
```

### Sequential pipeline

```
[Fetch] --> [Process] --> [Summarize]
```

```python
pipeline = SequentialAgent(sub_agents=[fetch, process, summarize])
```

### Parallel fan-out

```
         ┌--> [Weather]
[Start] -+--> [News]     --> [Merge via state]
         └--> [Stocks]
```

```python
gatherer = ParallelAgent(sub_agents=[weather, news, stocks])
```

### Loop until done

```
[Draft] --> [Review] --not_ok--> [Draft] (loop)
                     --ok------> [Done]
```

```python
refiner = LoopAgent(sub_agents=[draft, review], max_iterations=5)
```

### Multi-agent delegation

```
[Coordinator] --greeting--> [Greeter]
              --research--> [Researcher]
              --writing---> [Writer]
```

```python
coordinator = Agent(sub_agents=[greeter, researcher, writer])
```

### Hybrid: workflow + LLM agents

```
[ParallelAgent: gather] --> [SequentialAgent: process] --> [LlmAgent: report]
```

```python
gather = ParallelAgent(sub_agents=[agent_a, agent_b])
process = SequentialAgent(sub_agents=[gather, transform])
report = Agent(name="reporter", model="gemini-2.5-flash", instruction="Summarize {data}")
full = SequentialAgent(sub_agents=[process, report])
```

---

## 10. Decomposition Guide — Extracting CIR from Google ADK

Follow these steps to produce a Common Intermediate Representation:

1. **Detect framework version.** Check imports: `from google.adk.*` confirms ADK. Check for `google-adk` in requirements.txt or pyproject.toml for version.

2. **Inventory agents.** Search for all agent instantiations. For each agent:
   - Record the name, model, and instruction.
   - List all tools (functions, BaseTool, AgentTool).
   - Record sub_agents if present.
   - Record output_key if set.
   - Classify type: LlmAgent, SequentialAgent, ParallelAgent, LoopAgent, or custom BaseAgent.
   - Each agent maps to a CIR agent.

3. **Inventory tools.** Collect all tool references from `tools=[...]` across all agents:
   - Plain functions: record name, docstring, parameter types.
   - BaseTool subclasses: record name, description, run method.
   - AgentTool: record the wrapped agent reference.
   - Built-in tools: record which ones (google_search, code_execution).
   - MCP tools: record server configuration.
   - Each tool maps to a CIR tool.

4. **Identify orchestration.** Determine the top-level pattern:
   - **Single Agent**: one `Agent` with tools — simplest CIR.
   - **LLM delegation**: `Agent` with `sub_agents` — LLM decides routing.
   - **Sequential**: `SequentialAgent` — ordered pipeline.
   - **Parallel**: `ParallelAgent` — concurrent execution.
   - **Loop**: `LoopAgent` — iterative until exit.
   - **Hybrid**: nested workflow + LLM agents.

5. **Map state and session.** Record:
   - Session service type (InMemorySessionService, DatabaseSessionService).
   - State keys used via `tool_context.state[...]`.
   - Template variables in instructions (`{var}`).
   - `output_key` bindings between sequential agents.

6. **Map memory.** Check for `memory_service=` on Runner. Record:
   - Memory service type.
   - Whether memory is used cross-session.

7. **Detect architecture pattern.** Classify as single-agent, delegation, sequential, parallel, loop, or hybrid.

8. **Emit CIR.** Combine all extracted components:
   - `agents[]` — one per Agent/LlmAgent instance
   - `tools[]` — one per tool (function, BaseTool, AgentTool, built-in)
   - `edges[]` — derived from sub_agents order, delegation, or workflow type
   - `state{}` — session state keys, output_key bindings, template variables
   - `memory{}` — memory service type and config
   - `architecture` — detected pattern label
