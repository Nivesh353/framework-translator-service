# CrewAI Code Generation Reference

> Target: crewai >= 1.13.x (2025-2026)

---

## 1. Required Imports

```python
from crewai import Agent, Task, Crew, Process
from crewai.tools import tool, BaseTool
from crewai import Flow
from crewai.flow.flow import start, listen, router, or_, and_
from crewai.flow.persistence import persist
from crewai.flow.human_feedback import human_feedback
from crewai.project import CrewBase, agent, task, crew
from pydantic import BaseModel
```

---

## 2. Agent Definition Template

```python
researcher = Agent(
    role="Senior Research Analyst",
    goal="Discover and summarize the latest trends in {topic}",
    backstory="You are an experienced analyst with deep expertise in research.",
    llm="openai/gpt-4o",
    tools=[search_tool],
    verbose=True,
    memory=True,
    allow_delegation=False,
    max_iter=5,
)
```

Key parameters:
- `role` — defines the agent's function within the crew
- `goal` — the objective the agent is trying to achieve (supports `{variable}` interpolation)
- `backstory` — context and personality for the agent
- `llm` — model identifier string or LLM instance
- `tools` — list of tools available to this agent
- `allow_delegation` — whether the agent can delegate tasks to other agents
- `memory` — enables the agent to remember previous interactions

---

## 3. Task Definition Template

```python
research_task = Task(
    description="Research the latest developments in {topic} and compile a summary.",
    expected_output="A bullet-point summary with at least 5 key findings.",
    agent=researcher,
    tools=[search_tool],
    output_json=ResearchOutput,   # optional: Pydantic model for structured output
    output_file="research.md",   # optional: write result to file
    context=[previous_task],      # optional: tasks whose output feeds into this one
)
```

Key parameters:
- `description` — what the task requires (supports `{variable}` interpolation)
- `expected_output` — describes the desired output format
- `agent` — the agent assigned to execute this task
- `context` — list of other Task objects whose outputs are provided as context

---

## 4. Crew Assembly Template

```python
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, writing_task],
    process=Process.sequential,    # or Process.hierarchical
    verbose=True,
    memory=True,
    planning=True,                 # optional: enables planning before execution
)
```

---

## 5. Tool Definition Template

Using the `@tool` decorator (simplest approach):

```python
@tool
def search(query: str) -> str:
    """Search the web for information about a topic."""
    return f"Results for: {query}"
```

Using `BaseTool` subclass (more control):

```python
from crewai.tools import BaseTool
from pydantic import Field

class SearchTool(BaseTool):
    name: str = "Web Search"
    description: str = "Search the web for information about a topic."
    base_url: str = Field(default="https://api.search.com")

    def _run(self, query: str) -> str:
        return f"Results for: {query}"
```

---

## 6. YAML Config Template

**agents.yaml:**

```yaml
researcher:
  role: Senior Research Analyst
  goal: Discover and summarize the latest trends in {topic}
  backstory: >
    You are an experienced analyst with deep expertise
    in research and data analysis.

writer:
  role: Content Writer
  goal: Write engaging content based on research findings
  backstory: >
    You are a skilled writer who transforms complex
    information into clear, compelling content.
```

**tasks.yaml:**

```yaml
research_task:
  description: >
    Research the latest developments in {topic}
    and compile a comprehensive summary.
  expected_output: >
    A bullet-point summary with at least 5 key findings,
    including sources.
  agent: researcher

writing_task:
  description: >
    Write an article based on the research findings.
  expected_output: >
    A well-structured article of approximately 500 words.
  agent: writer
  output_file: article.md
```

---

## 7. CrewBase Template

```python
from crewai import Agent, Task, Crew, Process
from crewai.project import CrewBase, agent, task, crew

@CrewBase
class ResearchCrew:
    """Research crew using YAML config."""

    agents_config = "config/agents.yaml"
    tasks_config = "config/tasks.yaml"

    @agent
    def researcher(self) -> Agent:
        return Agent(
            config=self.agents_config["researcher"],
            tools=[search_tool],
            verbose=True,
        )

    @agent
    def writer(self) -> Agent:
        return Agent(
            config=self.agents_config["writer"],
            verbose=True,
        )

    @task
    def research_task(self) -> Task:
        return Task(config=self.tasks_config["research_task"])

    @task
    def writing_task(self) -> Task:
        return Task(
            config=self.tasks_config["writing_task"],
            output_file="article.md",
        )

    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,   # auto-collected from @agent methods
            tasks=self.tasks,     # auto-collected from @task methods
            process=Process.sequential,
            verbose=True,
        )
```

`self.agents` and `self.tasks` are automatically populated by `@CrewBase` from decorated methods.

---

## 8. Process Templates

**Sequential** — tasks run one after another, output of each feeds into the next:

```python
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, writing_task],
    process=Process.sequential,
)
```

**Hierarchical** — a manager agent delegates and coordinates tasks:

```python
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, writing_task],
    process=Process.hierarchical,
    manager_llm="openai/gpt-4o",
)
```

---

## 9. Flow Template

```python
from crewai import Flow
from crewai.flow.flow import start, listen, router
from pydantic import BaseModel

class PipelineState(BaseModel):
    topic: str = ""
    research: str = ""
    draft: str = ""

class ContentFlow(Flow[PipelineState]):

    @start()
    def gather_input(self):
        self.state.topic = "AI Agents"
        return self.state.topic

    @router(gather_input)
    def route_complexity(self):
        if len(self.state.topic) > 20:
            return "deep_research"
        return "quick_research"

    @listen("quick_research")
    def quick_research(self):
        self.state.research = f"Quick summary of {self.state.topic}"
        return self.state.research

    @listen("deep_research")
    def deep_research(self):
        # Could kick off a full Crew here
        result = ResearchCrew().crew().kickoff(inputs={"topic": self.state.topic})
        self.state.research = result.raw
        return self.state.research

    @listen(quick_research, deep_research)
    def write_draft(self):
        self.state.draft = f"Article about: {self.state.research}"
        return self.state.draft


flow = ContentFlow()
result = flow.kickoff()
```

Key rules:
- `@start()` marks entry points; multiple `@start` methods run in parallel.
- `@listen(method_or_string)` triggers when the referenced method completes.
- `@router(method)` returns a string that selects which `@listen` branch to activate.
- Use `or_(method_a, method_b)` to trigger when any completes (replaces `OR_` in v1.13+).
- Use `and_(method_a, method_b)` to wait for all methods before triggering.

### Persistent Flow Template (v1.8+)

```python
from crewai.flow.persistence import persist
from pydantic import BaseModel

class DurableState(BaseModel):
    counter: int = 0
    data: str = ""

@persist
class DurableFlow(Flow[DurableState]):
    @start()
    def begin(self):
        self.state.counter += 1
        return "started"

    @listen(begin)
    def process(self, output):
        self.state.data = f"Processed: {output}"
```

State is auto-saved to SQLite after each step. On crash/restart, the flow resumes from the last completed step.

### Human Feedback Template (v1.8+)

```python
from crewai.flow.human_feedback import human_feedback, HumanFeedbackResult

class ApprovalFlow(Flow):
    @start()
    @human_feedback(
        message="Approve this content?",
        emit=["approved", "rejected"],
        default_outcome="rejected",
    )
    def generate(self):
        return "Generated content"

    @listen("approved")
    def publish(self, result: HumanFeedbackResult):
        print(f"Publishing with feedback: {result.feedback}")

    @listen("rejected")
    def revise(self, result: HumanFeedbackResult):
        print("Revising...")
```

### Flow Memory Template (v1.13+)

```python
class MemoryFlow(Flow[PipelineState]):
    @start()
    def step_one(self):
        self.remember("key_insight", "important finding")
        return "done"

    @listen(step_one)
    def step_two(self):
        insight = self.recall("key_insight")
        all_memories = self.extract_memories()
        self.state.research = f"Using insight: {insight}"
```

### Combinators Template

```python
from crewai.flow.flow import or_, and_

class CombinedFlow(Flow):
    @start()
    def step_a(self):
        return "A done"

    @start()
    def step_b(self):
        return "B done"

    @listen(or_(step_a, step_b))
    def on_any(self, result):
        """Fires when EITHER step_a or step_b completes."""
        print(f"First result: {result}")

    @listen(and_(step_a, step_b))
    def on_all(self):
        """Fires when BOTH step_a and step_b complete."""
        print("Both done")
```

---

## 10. Entry Point Template

```python
# Simple kickoff
result = crew.kickoff(inputs={"topic": "AI Agents"})
print(result.raw)           # raw string output
print(result.json_dict)     # if output_json was set
print(result.token_usage)   # token consumption stats

# Async kickoff
result = await crew.kickoff_async(inputs={"topic": "AI Agents"})

# Batch kickoff (multiple input sets in parallel)
results = crew.kickoff_for_each(
    inputs=[
        {"topic": "AI Agents"},
        {"topic": "LLM Fine-tuning"},
    ]
)
```

---

## 11. Complete Minimal Example

```python
from crewai import Agent, Task, Crew, Process
from crewai.tools import tool


@tool
def get_weather(city: str) -> str:
    """Get the current weather for a city."""
    return f"The weather in {city} is sunny, 72F."


researcher = Agent(
    role="Weather Reporter",
    goal="Report accurate weather information for requested cities.",
    backstory="You are a reliable weather reporter with access to real-time data.",
    tools=[get_weather],
    verbose=True,
)

weather_task = Task(
    description="Get the current weather for {city} and write a brief report.",
    expected_output="A one-paragraph weather report for the requested city.",
    agent=researcher,
)

crew = Crew(
    agents=[researcher],
    tasks=[weather_task],
    process=Process.sequential,
    verbose=True,
)

result = crew.kickoff(inputs={"city": "Paris"})
print(result.raw)
```

---

## 12. Common Pitfalls

| Pitfall | Fix |
|---|---|
| Forgetting `expected_output` on a Task | Required field; CrewAI raises a validation error without it |
| Using `{variable}` in description but not passing `inputs={}` to `kickoff` | Variables render as literal `{variable}` strings |
| Setting `allow_delegation=True` with a single agent | Delegation fails with no one to delegate to; set `False` |
| Circular `context` dependencies between tasks | Tasks deadlock; ensure context flows in one direction |
| Missing `manager_llm` with `Process.hierarchical` | Hierarchical process requires a manager; provide `manager_llm` |
| Tool function missing docstring | CrewAI uses the docstring as the tool description; omitting it causes errors |
| `@CrewBase` without YAML files at expected paths | Set `agents_config` and `tasks_config` paths explicitly |
| Returning non-string from `@tool` function | Tools must return strings; serialize objects before returning |
| Flow `@listen` referencing undefined method name | Use the actual method reference or matching string; typos silently skip |
| `output_json` without a Pydantic model | Must be a `BaseModel` subclass; plain dicts are not accepted |
| Not awaiting `kickoff_async` | Returns a coroutine, not a result; must `await` it |
| Excessive `max_iter` with costly LLM | Each iteration is a full LLM call; set reasonable bounds |
| Using `OR_` (old) instead of `or_()` | v1.13+ uses lowercase `or_()` and `and_()` from `crewai.flow.flow` |
| `@persist` without flow state type | Use `Flow[MyState]` with a Pydantic model; untyped state may not serialize correctly |
| `self.remember()`/`self.recall()` outside a Flow | These methods are only available inside `Flow` subclass methods |
| `@human_feedback` without `emit` list | Must specify which listener names the feedback can emit to |
