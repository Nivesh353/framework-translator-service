# CrewAI Framework Patterns Reference

Use this reference to identify, decompose, and extract CIR from CrewAI-based agent code.

---

## 1. Import Fingerprints

Presence of any of these imports confirms a CrewAI codebase:

```python
# Core classes (functional API)
from crewai import Agent, Task, Crew, Process

# Decorator-based API (class pattern)
from crewai import CrewBase, agent, task, crew

# Tools
from crewai.tools import tool, BaseTool
from crewai_tools import SerperDevTool, ScrapeWebsiteTool, FileReadTool

# Flows (orchestration layer)
from crewai.flow.flow import Flow, listen, start, router, or_, and_   # or_ replaces OR_ in v1.13+
from crewai.flow.persistence import persist                            # durable state (v1.8+)
from crewai.flow.human_feedback import human_feedback                  # HITL approval (v1.8+)

# LLM configuration
from crewai import LLM
```

Secondary signals: YAML files named `agents.yaml` and `tasks.yaml` in a `config/` directory alongside the Python code.

---

## 2. Agent Patterns

### Functional API

```python
researcher = Agent(
    role="Senior Research Analyst",
    goal="Uncover cutting-edge developments in AI",
    backstory="You are a seasoned researcher at a leading tech think tank.",
    llm="gpt-4o",                    # string shorthand or LLM instance
    tools=[search_tool, scrape_tool],
    verbose=True,
    allow_delegation=False,
    memory=True,
    max_iter=15,
    max_rpm=10,
)
```

### Decorator / class-based API

```python
@CrewBase
class ResearchCrew:
    agents_config = "config/agents.yaml"
    tasks_config = "config/tasks.yaml"

    @agent
    def researcher(self) -> Agent:
        return Agent(
            config=self.agents_config["researcher"],
            tools=[SerperDevTool()],
        )
```

### Key Agent parameters
| Parameter | Purpose |
|---|---|
| `role` | The agent's job title / identity |
| `goal` | What the agent is trying to achieve |
| `backstory` | Context that shapes the agent's behavior |
| `llm` | Model string or LLM object |
| `tools` | List of tool instances available to this agent |
| `allow_delegation` | Whether agent can delegate to other agents |
| `memory` | Enable agent-level memory |
| `verbose` | Print execution details |
| `max_iter` | Maximum reasoning iterations |
| `step_callback` | Function called after each step |

### Identification rules
- Look for `Agent(...)` instantiation with `role`, `goal`, `backstory` (the three required fields).
- In YAML-based projects, agents are defined in `agents.yaml` and referenced by key.

---

## 3. Task Patterns

### Functional API

```python
research_task = Task(
    description="Research the latest trends in {topic}. Focus on...",
    expected_output="A detailed report with at least 5 key findings.",
    agent=researcher,
    tools=[search_tool],
    output_json=ResearchReport,        # Pydantic model for structured output
    output_file="report.md",
    human_input=False,
    context=[previous_task],           # tasks whose output feeds into this one
    async_execution=False,
)
```

### Decorator-based

```python
@task
def research_task(self) -> Task:
    return Task(
        config=self.tasks_config["research_task"],
        output_pydantic=ResearchReport,
    )
```

### Key Task parameters
| Parameter | Purpose |
|---|---|
| `description` | What the task requires (supports `{variable}` interpolation) |
| `expected_output` | Description of the desired result |
| `agent` | The agent assigned to this task |
| `tools` | Task-specific tools (override agent tools) |
| `context` | List of tasks whose outputs provide context |
| `output_json` | Pydantic model for JSON-structured output |
| `output_pydantic` | Pydantic model returned as object |
| `output_file` | File path to write the result |
| `human_input` | Prompt a human for review before finalizing |
| `async_execution` | Run this task asynchronously |
| `callback` | Function called with the task output |

### Identification
- Look for `Task(...)` with `description` and `expected_output`.
- `context=[other_task]` reveals data dependencies between tasks.

---

## 4. Crew Patterns

### Functional API

```python
crew = Crew(
    agents=[researcher, writer, editor],
    tasks=[research_task, write_task, edit_task],
    process=Process.sequential,       # or Process.hierarchical
    verbose=True,
    memory=True,
    manager_llm="gpt-4o",            # required for hierarchical process
    planning=True,                    # enable task planning step
    planning_llm="gpt-4o",
    output_log_file="crew_log.txt",
)

result = crew.kickoff(inputs={"topic": "AI agents"})
```

### Decorator-based

```python
@crew
def crew(self) -> Crew:
    return Crew(
        agents=self.agents,           # auto-collected from @agent methods
        tasks=self.tasks,             # auto-collected from @task methods
        process=Process.sequential,
        verbose=True,
    )
```

### Process types
- **`Process.sequential`** -- Tasks execute in list order. Each task's output is available to subsequent tasks.
- **`Process.hierarchical`** -- A manager agent (auto-created or explicit) delegates tasks to worker agents dynamically. Requires `manager_llm`.

### Execution

```python
result = crew.kickoff()                              # single run
result = crew.kickoff(inputs={"topic": "AI"})        # with variable interpolation
results = crew.kickoff_for_each(inputs=[...])         # batch over inputs
async_result = crew.kickoff_async(inputs={...})       # async execution
```

---

## 5. Tool Patterns

### @tool decorator

```python
from crewai.tools import tool

@tool("Search Database")
def search_db(query: str) -> str:
    """Search the internal database for relevant records."""
    return db.search(query)
```

### BaseTool subclass

```python
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

class SearchInput(BaseModel):
    query: str = Field(description="The search query")

class SearchTool(BaseTool):
    name: str = "Database Search"
    description: str = "Searches the internal database"
    args_schema: type[BaseModel] = SearchInput

    def _run(self, query: str) -> str:
        return db.search(query)
```

### Pre-built tools (crewai-tools package)

```python
from crewai_tools import (
    SerperDevTool,        # web search
    ScrapeWebsiteTool,    # web scraping
    FileReadTool,         # file reading
    DirectoryReadTool,    # directory listing
    PDFSearchTool,        # PDF search (RAG)
    YoutubeVideoSearchTool,
)
```

### Identification
- `@tool` decorator or `BaseTool` subclass.
- Tools from the `crewai_tools` package.
- Tools assigned at agent level (`Agent(tools=[...])`) or task level (`Task(tools=[...])`).

---

## 6. YAML Configuration

### agents.yaml

```yaml
researcher:
  role: "Senior Research Analyst"
  goal: "Uncover cutting-edge developments in {topic}"
  backstory: >
    You are a seasoned researcher at a leading tech think tank.
    Your expertise lies in identifying emerging trends.
  llm: gpt-4o
  allow_delegation: false

writer:
  role: "Content Writer"
  goal: "Write compelling content about {topic}"
  backstory: >
    You are a skilled writer known for clear, engaging prose.
```

### tasks.yaml

```yaml
research_task:
  description: >
    Conduct thorough research on {topic}.
    Identify key trends, players, and opportunities.
  expected_output: >
    A detailed report with at least 5 key findings,
    each backed by data or credible sources.
  agent: researcher

writing_task:
  description: >
    Using the research findings, write an article about {topic}.
  expected_output: >
    A polished article of 800-1200 words, ready for publication.
  agent: writer
  context:
    - research_task
```

### Variable interpolation
- `{variable_name}` in YAML is replaced at runtime via `crew.kickoff(inputs={"variable_name": "value"})`.

---

## 7. Flow Patterns

Flows orchestrate multiple crews and arbitrary logic in a structured pipeline.

```python
from crewai.flow.flow import Flow, listen, start, router, OR_

class ContentFlow(Flow):
    @start()
    def gather_requirements(self):
        return {"topic": "AI agents", "audience": "developers"}

    @listen(gather_requirements)
    def run_research_crew(self, requirements):
        crew = ResearchCrew().crew()
        result = crew.kickoff(inputs=requirements)
        return result

    @router(run_research_crew)
    def check_quality(self, research_output):
        if research_output.score > 0.8:
            return "write"
        return "revise"

    @listen("write")
    def run_writing_crew(self, research_output):
        crew = WritingCrew().crew()
        return crew.kickoff(inputs={"research": str(research_output)})

    @listen("revise")
    def run_revision(self, research_output):
        # re-run research with feedback
        return self.run_research_crew(research_output)
```

### Flow decorators
| Decorator | Purpose |
|---|---|
| `@start()` | Entry point of the flow; runs first. Multiple `@start` methods run in parallel |
| `@listen(method_or_name)` | Runs when the referenced method completes |
| `@router(method)` | Routes to different listeners based on return value |
| `or_(method_a, method_b)` | Listen trigger: fires when **any** listed method completes (replaces `OR_` in v1.13+) |
| `and_(method_a, method_b)` | Listen trigger: fires when **all** listed methods complete |
| `@persist` | Auto-persist flow state to SQLite for crash recovery (v1.8+) |
| `@human_feedback(...)` | Pause for human approval before continuing (v1.8+) |

### Flow state (Pydantic-based)

```python
from pydantic import BaseModel

class MyState(BaseModel):
    counter: int = 0
    message: str = ""

class MyFlow(Flow[MyState]):
    @start()
    def begin(self):
        self.state.counter = 1
        self.state.message = "Started"
```

### Persistent flows (v1.8+)

```python
from crewai.flow.persistence import persist

@persist
class DurableFlow(Flow[MyState]):
    @start()
    def begin(self):
        self.state.counter += 1
```

State is auto-saved to SQLite after each step and restored on restart.

### Human feedback (v1.8+)

```python
from crewai.flow.human_feedback import human_feedback, HumanFeedbackResult

class ReviewFlow(Flow):
    @start()
    @human_feedback(
        message="Approve this content?",
        emit=["approved", "rejected"],
        llm="gpt-4o-mini",
        default_outcome="rejected",
    )
    def generate_content(self):
        return "Draft content..."

    @listen("approved")
    def on_approval(self, result: HumanFeedbackResult):
        print(f"Approved with feedback: {result.feedback}")

    @listen("rejected")
    def on_rejection(self, result: HumanFeedbackResult):
        print("Rejected — revising")
```

### Flow memory (v1.13+)

```python
class MemoryFlow(Flow[MyState]):
    @start()
    def step_one(self):
        self.remember("key_insight", "important finding")

    @listen(step_one)
    def step_two(self):
        insight = self.recall("key_insight")
        # Also: self.extract_memories() for all stored memories
```

### Combinators

```python
from crewai.flow.flow import or_, and_

@listen(or_(step_a, step_b))   # fires when EITHER completes
def logger(self, result): ...

@listen(and_(step_a, step_b))  # fires when BOTH complete
def aggregator(self): ...
```

### Streaming and visualization (v1.13+)

```python
# Streaming
class StreamFlow(Flow):
    stream = True  # class attribute enables chunked output

flow = StreamFlow()
for chunk in flow.kickoff():
    print(chunk)

# Visualization
flow.plot("output")  # generates interactive HTML flow diagram
```

### Running a flow

```python
flow = ContentFlow()
result = flow.kickoff()

# Async
result = await flow.kickoff_async(inputs={"topic": "AI"})
```

---

## 8. Memory

### Crew-level memory

```python
crew = Crew(
    agents=[...],
    tasks=[...],
    memory=True,                      # enables all memory types
    embedder={                         # custom embedder for memory
        "provider": "openai",
        "config": {"model": "text-embedding-3-small"},
    },
)
```

### Memory types
| Type | Scope | Purpose |
|---|---|---|
| **Short-term** | Single crew execution | Context from recent interactions within the run |
| **Long-term** | Across executions | Learnings and insights persisted to storage |
| **Entity** | Across executions | Structured info about entities (people, orgs, etc.) |
| **User** | Across executions | User-specific preferences and history |

### Custom memory configuration

```python
from crewai.memory.short_term import ShortTermMemory
from crewai.memory.long_term import LongTermMemory
from crewai.memory.entity import EntityMemory

crew = Crew(
    ...,
    memory=True,
    short_term_memory=ShortTermMemory(...),
    long_term_memory=LongTermMemory(...),
    entity_memory=EntityMemory(...),
)
```

---

## 9. Decomposition Guide — Extracting CIR from CrewAI

Follow these steps to produce a Common Intermediate Representation:

1. **Locate agents.** Search for all `Agent(...)` instantiations or `@agent` decorated methods. For YAML-based projects, parse `agents.yaml`. For each agent, extract:
   - `role`, `goal`, `backstory` (define the agent's identity in CIR)
   - `llm` (model binding)
   - `tools` (list of tool names)
   - `allow_delegation` (inter-agent communication capability)

2. **Locate tasks.** Search for all `Task(...)` instantiations or `@task` decorated methods, or parse `tasks.yaml`. For each task, extract:
   - `description` and `expected_output`
   - `agent` assignment (which agent executes this)
   - `context` list (data dependencies -- these become CIR edges)
   - `output_json` / `output_pydantic` (structured output schema)

3. **Locate the crew.** Find `Crew(...)` instantiation. Extract:
   - `process` type (sequential or hierarchical)
   - Agent and task lists (confirm ordering)
   - `manager_llm` if hierarchical

4. **Map execution order.**
   - **Sequential**: Tasks execute in list order. CIR edges: `task[0] -> task[1] -> ... -> task[n]`.
   - **Hierarchical**: Manager delegates dynamically. CIR edge: `manager -> each_agent` (conditional).
   - **Context dependencies**: `Task.context` creates explicit data-flow edges between tasks regardless of process type.

5. **Inventory tools.** Collect all `@tool` functions, `BaseTool` subclasses, and `crewai_tools` imports. Record name, description, and parameter schema.

6. **Check for Flows.** If a `Flow` subclass exists, it is the top-level orchestrator:
   - `@start` methods are entry points.
   - `@listen` edges define the flow DAG.
   - `@router` methods create conditional branches.
   - Each crew kickoff inside a flow method is a sub-graph.
   - Check for `@persist` — durable state persistence.
   - Check for `@human_feedback` — HITL approval gates.
   - Check for `self.remember()`/`self.recall()` — flow-level memory.
   - Check for `or_()`/`and_()` combinators — multi-trigger listeners.
   - Check for `stream = True` — streaming flow output.

7. **Map memory.** Check `Crew(memory=True)` and any custom memory classes. Record memory types enabled.

8. **Emit CIR.** Combine all extracted components:
   - `agents[]` -- one entry per Agent with role, goal, model, tools
   - `tasks[]` -- one entry per Task with description, assigned agent, dependencies
   - `tools[]` -- one entry per tool definition
   - `edges[]` -- derived from process type, task order, and context dependencies
   - `memory{}` -- memory types and embedder config
   - `orchestration` -- "sequential", "hierarchical", or "flow" with flow graph
   - `variables[]` -- all `{variable}` placeholders found in descriptions
