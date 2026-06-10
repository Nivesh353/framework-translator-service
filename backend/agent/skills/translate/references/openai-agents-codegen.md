# OpenAI Agents SDK -- Code Generation Reference

> Package: `openai-agents` (pip install openai-agents)
> Docs: https://openai.github.io/openai-agents-python/
> All agent code MUST be async. Entry point uses `asyncio.run()`.

---

## 1. Required Imports

```python
import asyncio
from pydantic import BaseModel
from agents import (
    Agent,
    Runner,
    function_tool,
    handoff,
    GuardrailFunctionOutput,
    InputGuardrail,
    OutputGuardrail,
    RunContextWrapper,
    trace,
    ModelSettings,
    RunConfig,
)
```

---

## 2. Agent Definition Template

```python
agent = Agent(
    name="Agent Name",
    instructions="You are a helpful assistant that ...",
    tools=[my_tool],                    # list of @function_tool decorated functions
    handoffs=[other_agent],             # list of Agent instances or handoff() objects
    model="gpt-4o",                     # model string (default: gpt-4o)
    output_type=MyPydanticModel,        # optional: forces structured output
    input_guardrails=[my_input_guard],  # optional: list of InputGuardrail
    output_guardrails=[my_output_guard],# optional: list of OutputGuardrail
    model_settings=ModelSettings(       # optional: model-level settings
        temperature=0.7,
    ),
)
```

### Dynamic Instructions (using context)

```python
def dynamic_instructions(
    context: RunContextWrapper[MyContext], agent: Agent
) -> str:
    return f"You are helping user {context.context.user_name}."

agent = Agent(
    name="Dynamic Agent",
    instructions=dynamic_instructions,
)
```

---

## 3. Tool Definition Template

### Basic tool (no context needed)

```python
@function_tool
def get_weather(city: str) -> str:
    """Get the current weather for a city."""
    return f"The weather in {city} is sunny, 72F."
```

### Tool with RunContext access

```python
@function_tool
async def get_user_orders(
    context: RunContextWrapper[MyContext],
    limit: int = 5,
) -> str:
    """Fetch recent orders for the current user."""
    user_id = context.context.user_id
    orders = await fetch_orders(user_id, limit)
    return str(orders)
```

### Custom tool name

```python
@function_tool(name_override="search_db", description_override="Search the database")
def _internal_search(query: str) -> str:
    return run_search(query)
```

---

## 4. Handoff Template

### Simple handoff

```python
billing_agent = Agent(name="Billing Agent", instructions="Handle billing questions.")
support_agent = Agent(name="Support Agent", instructions="Handle support.", handoffs=[billing_agent])
```

### Conditional / custom handoff

```python
from agents import handoff

def on_handoff(context: RunContextWrapper[MyContext]) -> None:
    """Runs when this handoff is triggered. Use for side effects."""
    context.context.routed_to = "billing"

billing_handoff = handoff(
    agent=billing_agent,
    on_handoff=on_handoff,
    tool_name_override="transfer_to_billing",
    tool_description_override="Transfer to billing when user asks about charges.",
)

triage_agent = Agent(
    name="Triage",
    instructions="Route the user to the right agent.",
    handoffs=[billing_handoff],
)
```

---

## 5. Guardrail Templates

### Input Guardrail

```python
async def check_topic_allowed(
    context: RunContextWrapper[None], agent: Agent, input: str
) -> GuardrailFunctionOutput:
    # Use a lightweight agent or simple logic to classify
    result = await Runner.run(
        topic_checker_agent, input, context=context.context
    )
    is_blocked = result.final_output.lower().startswith("blocked")
    return GuardrailFunctionOutput(
        output_info={"classification": result.final_output},
        tripwire_triggered=is_blocked,
    )

my_input_guard = InputGuardrail(guardrail_function=check_topic_allowed)
```

### Output Guardrail

```python
async def check_no_secrets(
    context: RunContextWrapper[None], agent: Agent, output: str
) -> GuardrailFunctionOutput:
    has_secret = "password" in output.lower() or "ssn" in output.lower()
    return GuardrailFunctionOutput(
        output_info={"flagged": has_secret},
        tripwire_triggered=has_secret,
    )

my_output_guard = OutputGuardrail(guardrail_function=check_no_secrets)
```

> **Note:** Input guardrails run only on the *first* agent. Output guardrails run
> only on the agent that produces the *final* output. Guardrails run in parallel
> with agent execution. If `tripwire_triggered=True`, an exception is raised and
> execution halts immediately.

---

## 6. Structured Output Template

```python
from pydantic import BaseModel

class AnalysisResult(BaseModel):
    summary: str
    sentiment: str        # "positive" | "negative" | "neutral"
    confidence: float     # 0.0 to 1.0
    key_topics: list[str]

analyst = Agent(
    name="Analyst",
    instructions="Analyze the provided text and return structured results.",
    output_type=AnalysisResult,
    model="gpt-4o",
)

# result.final_output will be an AnalysisResult instance
result = await Runner.run(analyst, "The product launch was a huge success...")
print(result.final_output.sentiment)  # "positive"
```

---

## 7. Runner Template

### Basic run

```python
result = await Runner.run(agent, "User message here")
print(result.final_output)  # str or output_type instance
```

### Run with context

```python
from dataclasses import dataclass

@dataclass
class MyContext:
    user_id: str
    session_id: str

ctx = MyContext(user_id="u_123", session_id="s_456")
result = await Runner.run(agent, "What are my recent orders?", context=ctx)
```

### Run with RunConfig

```python
config = RunConfig(
    model="gpt-4o-mini",          # override model for this run
    max_turns=10,                  # max agent loop iterations
    input_guardrails=[guard],      # run-level guardrails
    output_guardrails=[guard],
)
result = await Runner.run(agent, "Hello", run_config=config)
```

### Streamed run

```python
async for event in Runner.run_streamed(agent, "Tell me a story"):
    # event is a streaming event (text delta, tool call, etc.)
    if hasattr(event, "data"):
        print(event.data, end="", flush=True)
```

---

## 8. Tracing Template

```python
from agents import trace

async def main():
    with trace("My Workflow"):
        result1 = await Runner.run(agent_a, "Step one input")
        result2 = await Runner.run(agent_b, result1.final_output)
    # Traces are viewable in the OpenAI Dashboard under Traces
```

> Tracing is automatic for individual `Runner.run()` calls. Use the `trace()`
> context manager to group multiple runs under a single named trace.

---

## 9. Complete Minimal Example

```python
import asyncio
from pydantic import BaseModel
from agents import Agent, Runner, function_tool, handoff, trace

# --- Tools ---
@function_tool
def lookup_order(order_id: str) -> str:
    """Look up an order by its ID."""
    return f"Order {order_id}: shipped on 2026-03-20, arrives 2026-03-25."

@function_tool
def cancel_order(order_id: str) -> str:
    """Cancel an order by its ID."""
    return f"Order {order_id} has been cancelled."

# --- Agents ---
refund_agent = Agent(
    name="Refund Specialist",
    instructions="You handle refunds. Ask for the order ID, then process the refund.",
    tools=[lookup_order, cancel_order],
)

triage_agent = Agent(
    name="Triage Agent",
    instructions=(
        "You are the first point of contact. Greet the user, understand their "
        "issue, and hand off to the Refund Specialist if they need a refund."
    ),
    handoffs=[refund_agent],
)

# --- Entry Point ---
async def main():
    with trace("Customer Support Session"):
        result = await Runner.run(
            triage_agent,
            "Hi, I need to cancel order ORD-9921 and get a refund.",
        )
        print(result.final_output)

if __name__ == "__main__":
    asyncio.run(main())
```

---

## 10. Common Pitfalls

| Pitfall | Details |
|---|---|
| **Forgetting `async`/`await`** | `Runner.run()` is async. All tool functions that do I/O should be `async`. The entry point must use `asyncio.run()`. |
| **Missing `OPENAI_API_KEY`** | The SDK reads from the `OPENAI_API_KEY` env var by default. No key = immediate failure. |
| **`output_type` + handoffs conflict** | An agent with `output_type` set produces structured output. If it also has handoffs, the model chooses between producing output or handing off. Do not set `output_type` on triage/routing agents. |
| **Guardrails on wrong agent** | Input guardrails only fire on the *first* agent. Output guardrails only fire on the *last* agent (the one that produces final output). Placing them on intermediate agents has no effect. |
| **Tool return type** | Tools must return `str`. Returning other types (dict, int) will cause errors. Serialize to string. |
| **Circular handoffs** | Agent A hands to B, B hands to A -- can loop forever. Use `max_turns` in `RunConfig` to cap iterations. |
| **Context type mismatch** | The context type (`T` in `RunContextWrapper[T]`) must match across all agents, tools, and guardrails in a single run. |
| **Sync `function_tool`** | Sync tools work but block the event loop. Use `async` for any I/O-bound tool. |
| **Model compatibility** | Not all models support structured output or tool calling. Stick to `gpt-4o`, `gpt-4o-mini`, or newer. |
