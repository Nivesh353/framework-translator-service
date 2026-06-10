# OpenAI Agents SDK -- Framework Pattern Reference

> Reference for the framework-translator-agent's analyze skill.
> Covers the OpenAI Agents SDK (package: `openai-agents`, repo: `openai/openai-agents-python`).

---

## 1. Import Fingerprints

Detecting an OpenAI Agents SDK project starts with recognizing these imports:

```python
# Core agent and runner
from agents import Agent, Runner

# Multi-agent handoffs
from agents import handoff

# Tool decoration
from agents import function_tool

# Guardrails
from agents import (
    GuardrailFunctionOutput,
    InputGuardrail,
    OutputGuardrail,
    RunContextWrapper,
)

# Tracing
from agents import trace

# Run configuration
from agents import RunConfig

# Structured output helpers (Pydantic)
from pydantic import BaseModel
```

Secondary signals: `from agents.tool import FunctionTool`, `from agents import ModelSettings`.

---

## 2. Agent Patterns

An `Agent` is the central abstraction. It wraps a model, a system prompt, tools,
handoffs, guardrails, and an optional structured output type.

```python
agent = Agent(
    name="research_agent",
    instructions="You are a research assistant. Answer questions factually.",
    tools=[search_tool, summarize_tool],
    handoffs=[handoff(writing_agent)],
    model="gpt-4o",
    output_type=ResearchReport,          # optional Pydantic model
    input_guardrails=[topic_guardrail],   # optional
    output_guardrails=[safety_guardrail], # optional
)
```

### Key properties

| Parameter | Purpose |
|---|---|
| `name` | Human-readable label; appears in traces |
| `instructions` | System prompt string (or callable returning a string) |
| `tools` | List of `FunctionTool` / decorated functions |
| `handoffs` | List of `Handoff` objects or agents |
| `model` | Model identifier string |
| `output_type` | Pydantic `BaseModel` subclass for structured output |
| `input_guardrails` | List of `InputGuardrail` instances |
| `output_guardrails` | List of `OutputGuardrail` instances |

Dynamic instructions are supported -- pass a callable that receives
`RunContextWrapper` and the agent, returning a string:

```python
def dynamic_instructions(ctx: RunContextWrapper, agent: Agent) -> str:
    return f"You are helping user {ctx.context.user_name}."

agent = Agent(name="helper", instructions=dynamic_instructions)
```

---

## 3. Handoff Patterns

Handoffs let one agent delegate to another. The runner manages the transition.

```python
from agents import handoff

# Simple handoff -- target agent becomes the active agent
billing_agent = Agent(name="billing", instructions="Handle billing questions.")
triage_agent = Agent(
    name="triage",
    instructions="Route the user to the right agent.",
    handoffs=[handoff(billing_agent)],
)
```

### Handoff with description and input filter

```python
handoff(
    agent=billing_agent,
    description="Transfer to billing when the user asks about invoices.",
    input_filter=lambda ctx, inputs: inputs[-3:],  # keep last 3 messages
)
```

### Conditional / programmatic handoffs

Use a tool that returns a `Handoff` or simply list multiple handoffs and let the
model choose based on their descriptions.

---

## 4. Tool Patterns

### @function_tool decorator

The simplest way to create a tool. The SDK auto-generates the JSON schema from
the function signature and docstring.

```python
from agents import function_tool

@function_tool
def lookup_order(order_id: str) -> str:
    """Look up an order by its ID and return status."""
    return db.get_order(order_id).status
```

### Tools with RunContext

Access shared state through `RunContextWrapper`:

```python
@function_tool
def get_user_balance(ctx: RunContextWrapper[UserContext]) -> str:
    """Return the current balance for the logged-in user."""
    user = ctx.context
    return f"${user.balance:.2f}"
```

The first parameter typed as `RunContextWrapper` is automatically injected by
the runner and is *not* exposed to the model.

### FunctionTool class (manual creation)

```python
from agents.tool import FunctionTool

tool = FunctionTool(
    name="search",
    description="Search the knowledge base.",
    params_json_schema={...},
    on_invoke_tool=my_search_fn,
)
```

---

## 5. Guardrail Patterns

Guardrails perform safety/validation checks. Input guardrails run on the
initial user input; output guardrails run on the agent's final response.

### InputGuardrail

```python
from agents import InputGuardrail, GuardrailFunctionOutput, RunContextWrapper, Agent

async def check_topic(ctx: RunContextWrapper, agent: Agent, input: str) -> GuardrailFunctionOutput:
    # Use a lightweight classifier agent or custom logic
    result = await Runner.run(classifier_agent, input)
    is_off_topic = result.final_output.lower() == "off_topic"
    return GuardrailFunctionOutput(
        output_info={"reasoning": result.final_output},
        tripwire_triggered=is_off_topic,
    )

topic_guardrail = InputGuardrail(guardrail_function=check_topic)
```

When `tripwire_triggered=True`, the runner raises `InputGuardrailTripwireTriggered`
and execution stops.

### OutputGuardrail

```python
from agents import OutputGuardrail, GuardrailFunctionOutput

async def check_safety(ctx, agent, output) -> GuardrailFunctionOutput:
    flagged = "unsafe" in str(output).lower()
    return GuardrailFunctionOutput(
        output_info={"flagged": flagged},
        tripwire_triggered=flagged,
    )

safety_guardrail = OutputGuardrail(guardrail_function=check_safety)
```

Output guardrails always run *after* the agent completes (no parallel mode).

---

## 6. Runner Patterns

The `Runner` executes agents, handling tool calls and handoffs automatically.

```python
from agents import Runner

# Basic run (async)
result = await Runner.run(agent, input="What is my balance?")
print(result.final_output)

# Run with context
result = await Runner.run(
    agent,
    input="What is my balance?",
    context=UserContext(user_id="u123", balance=42.50),
)

# Streamed run
async for event in Runner.run_streamed(agent, input="Tell me a story."):
    if event.type == "raw_response_event":
        print(event.data, end="", flush=True)
```

### RunConfig

```python
from agents import RunConfig

config = RunConfig(
    model="gpt-4o-mini",
    max_turns=10,
    tracing_disabled=False,
)
result = await Runner.run(agent, input="Hello", run_config=config)
```

---

## 7. Tracing

Tracing is enabled by default and sends spans to the OpenAI backend.

```python
from agents import trace

# Custom trace grouping
with trace("customer_support_flow"):
    result = await Runner.run(triage_agent, input=user_msg)
```

Traces capture LLM generations, tool calls, handoffs, and guardrail results.
Custom spans can be added for application-specific instrumentation. External
trace processors (e.g., Langfuse, MLflow) can be configured via a custom
`TraceProvider`.

---

## 8. Output Types (Structured Output)

Use a Pydantic model as `output_type` to get validated, typed responses:

```python
from pydantic import BaseModel

class ResearchReport(BaseModel):
    title: str
    summary: str
    confidence: float

agent = Agent(
    name="researcher",
    instructions="Produce a research report.",
    output_type=ResearchReport,
)

result = await Runner.run(agent, input="Summarize recent AI trends.")
report: ResearchReport = result.final_output
print(report.title)
```

When `output_type` is set, the model is forced to produce JSON matching the
schema, and the SDK validates/parses it automatically.

---

## 9. CIR Decomposition Guide

When translating an OpenAI Agents SDK project to CIR, extract:

### Agents (CIR nodes)
- Each `Agent(...)` instantiation becomes a CIR agent node.
- `instructions` maps to `system_prompt`.
- `model` maps to `model_id`.
- `output_type` maps to `structured_output_schema`.

### Tools (CIR capabilities)
- Each `@function_tool` or `FunctionTool` becomes a CIR tool definition.
- Extract `name`, `description`, parameter schema, and implementation body.
- Tools using `RunContextWrapper` indicate shared-state dependency -- note
  the context type in CIR metadata.

### Routing (CIR edges)
- `handoffs` list defines agent-to-agent edges in the CIR graph.
- Handoff `description` maps to CIR edge conditions / labels.
- Multiple handoffs on one agent = conditional routing node.

### Guardrails (CIR constraints)
- `InputGuardrail` maps to CIR `pre_conditions` on the agent node.
- `OutputGuardrail` maps to CIR `post_conditions` on the agent node.
- `tripwire_triggered` semantics = hard-fail constraint.

### Execution (CIR runtime)
- `Runner.run()` = single-turn execution.
- `Runner.run_streamed()` = streaming execution mode.
- `RunConfig.max_turns` = CIR max iteration count.
- Tracing config maps to CIR observability settings.

### Common decomposition pitfalls
- Dynamic instructions (callables) must be captured as templates with
  context variable references, not static strings.
- Input filters on handoffs are routing logic -- do not discard them.
- Context type (`RunContextWrapper[T]`) carries shared state schema;
  extract `T` as a CIR shared-state definition.
