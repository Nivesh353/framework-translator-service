# LangGraph Framework Patterns Reference

Use this reference to identify, decompose, and extract CIR from LangGraph-based agent code.

---

## 1. Import Fingerprints

Presence of any of these imports confirms a LangGraph codebase:

```python
# Core graph construction
from langgraph.graph import StateGraph, START, END
from langgraph.graph import MessagesState          # prebuilt state with "messages" key
from langgraph.graph.message import add_messages    # reducer for message lists

# Prebuilt components (NOTE: langgraph.prebuilt deprecated in v2.0 — moved to langchain.agents)
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.prebuilt import create_react_agent   # one-liner ReAct agent

# v2.0 types
from langgraph.types import interrupt              # human-in-the-loop (replaces interrupt_before/after)
from langgraph.types import Command                # state update + routing in one return
from langgraph.types import CachePolicy            # node-level caching with TTL

# Checkpointing / memory
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.checkpoint.postgres import PostgresSaver

# Common companion imports (LangChain)
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
```

Secondary signals: `typing.Annotated`, `operator.add`, `TypedDict` used alongside the above. v2.0 signals: `interrupt()` calls, `Command(...)` returns, `CachePolicy`, `from langgraph.types import`.

---

## 2. Agent / Node Patterns

Nodes are **plain Python functions** (or async functions) that receive the current state and return a partial state update (dict).

```python
# Synchronous node
def chatbot(state: State) -> dict:
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

# Async node
async def researcher(state: State) -> dict:
    result = await llm.ainvoke(state["messages"])
    return {"messages": [result]}
```

**Identification rules:**
- A node function's **first parameter** is always the graph state (TypedDict or MessagesState).
- The **return value** is a dict whose keys are a subset of the state keys.
- Nodes are registered with `graph.add_node("name", function)`.
- A node can also be a **runnable** (LangChain chain, LLM, or another compiled graph).

```python
graph.add_node("agent", chatbot)
graph.add_node("tools", ToolNode(tools=[search, calc]))
graph.add_node("subgraph", compiled_subgraph)       # sub-graph as node
```

---

## 3. State Patterns

### TypedDict state (custom)

```python
from typing import Annotated, TypedDict
import operator

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]   # reducer: merge message lists
    context: str                                # overwrite on each update
    steps: Annotated[list, operator.add]        # reducer: concatenate lists
    final_answer: str
```

### MessagesState (prebuilt)

```python
from langgraph.graph import MessagesState

# Equivalent to:
# class MessagesState(TypedDict):
#     messages: Annotated[list[AnyMessage], add_messages]

graph = StateGraph(MessagesState)
```

### Reducer semantics
- **No annotation**: value is overwritten on each node return.
- **`Annotated[list, operator.add]`**: lists are concatenated.
- **`Annotated[list, add_messages]`**: messages are merged by ID (upsert behavior).

### State identification checklist
1. Look for a class inheriting from `TypedDict` or `MessagesState`.
2. Note every key -- each represents a data channel in the graph.
3. Check for `Annotated` wrappers to find reducer functions.

---

## 4. Edge Patterns

### Static edges

```python
graph.add_edge(START, "agent")          # entry point
graph.add_edge("tools", "agent")        # tools always return to agent
graph.add_edge("summarizer", END)       # terminal node
```

### Conditional edges

```python
def should_continue(state: State) -> str:
    last = state["messages"][-1]
    if last.tool_calls:
        return "tools"
    return END

graph.add_conditional_edges("agent", should_continue)
# Optionally with explicit mapping:
graph.add_conditional_edges("agent", should_continue, {
    "tools": "tools",
    END: END,
})
```

### Prebuilt condition

```python
# tools_condition returns "tools" if last message has tool_calls, else END
graph.add_conditional_edges("agent", tools_condition)
```

### Sentinels
- **`START`** -- virtual entry point; edges from START define which node(s) run first.
- **`END`** -- virtual exit; edges to END terminate execution.

---

## 5. Tool Patterns

### Defining tools

```python
from langchain_core.tools import tool

@tool
def search(query: str) -> str:
    """Search the web for information."""
    return web_search(query)
```

### Binding tools to a model

```python
llm = ChatOpenAI(model="gpt-4o")
llm_with_tools = llm.bind_tools([search, calculator])
```

### ToolNode

`ToolNode` automatically executes tool calls found in the last AI message:

```python
from langgraph.prebuilt import ToolNode

tool_node = ToolNode(tools=[search, calculator])
graph.add_node("tools", tool_node)
```

### Identification
- Look for `@tool` decorators or `BaseTool` subclasses.
- Look for `.bind_tools(...)` on an LLM instance.
- Look for `ToolNode(...)` instantiation.

---

## 6. Compilation & Execution

### Compile

```python
# Without memory
app = graph.compile()

# With checkpointer (enables memory / resumption)
memory = MemorySaver()
app = graph.compile(checkpointer=memory)

# With interrupt_before / interrupt_after (human-in-the-loop)
app = graph.compile(checkpointer=memory, interrupt_before=["tools"])
```

### Invoke

```python
# Synchronous
result = app.invoke({"messages": [HumanMessage("Hello")]})

# With thread config (required when checkpointer is used)
config = {"configurable": {"thread_id": "user-123"}}
result = app.invoke({"messages": [HumanMessage("Hello")]}, config)
```

### Stream

```python
for event in app.stream({"messages": [HumanMessage("Plan a trip")]}, config):
    print(event)

# Async streaming
async for event in app.astream(inputs, config):
    print(event)

# Stream specific modes
for chunk in app.stream(inputs, config, stream_mode="values"):
    print(chunk)
```

---

## 7. Common Architectures

### ReAct loop (most common)

```
START -> agent -> should_continue? --tool_calls--> tools -> agent
                                   --no_calls----> END
```

```python
graph = StateGraph(MessagesState)
graph.add_node("agent", call_model)
graph.add_node("tools", ToolNode(tools=tools))
graph.add_edge(START, "agent")
graph.add_conditional_edges("agent", tools_condition)
graph.add_edge("tools", "agent")
app = graph.compile()
```

### One-liner ReAct

```python
from langgraph.prebuilt import create_react_agent
app = create_react_agent(model, tools, checkpointer=memory)
```

### Multi-agent with sub-graphs

```python
researcher_graph = create_researcher().compile()
writer_graph = create_writer().compile()

supervisor = StateGraph(State)
supervisor.add_node("researcher", researcher_graph)
supervisor.add_node("writer", writer_graph)
supervisor.add_node("supervisor", supervisor_node)
supervisor.add_edge(START, "supervisor")
supervisor.add_conditional_edges("supervisor", route_to_agent)
```

### Map-reduce / fan-out

```python
graph.add_conditional_edges("planner", fan_out, ["worker_a", "worker_b"])
graph.add_edge("worker_a", "aggregator")
graph.add_edge("worker_b", "aggregator")
```

---

## 8. v2.0 Patterns (February 2026)

### Command pattern (state update + routing)

The `Command` object lets a node update state and control routing in a single return:

```python
from langgraph.types import Command

def routing_node(state: State) -> Command:
    if state["needs_review"]:
        return Command(update={"status": "reviewing"}, goto="reviewer")
    return Command(update={"status": "done"}, goto="__end__")
```

`Command` replaces the pattern of returning state + using a separate routing function.

### interrupt() function (human-in-the-loop)

The `interrupt()` function pauses graph execution for human input. Replaces the older `interrupt_before`/`interrupt_after` compile options:

```python
from langgraph.types import interrupt, Command

def human_review_node(state: State) -> Command:
    answer = interrupt({"question": "Approve this action?", "context": state["draft"]})
    if answer == "approve":
        return Command(goto="execute")
    return Command(update={"feedback": answer}, goto="revise")
```

### Node caching with TTL

Cache expensive node results to avoid redundant computation:

```python
from langgraph.types import CachePolicy

graph.add_node("expensive_lookup", lookup_node, cache_policy=CachePolicy(ttl=3))
```

### Guardrail nodes

First-class guardrail primitives for content filtering, rate limiting, and compliance:

```python
graph.add_guardrail("input_filter", guardrail_fn)
```

### Deferred nodes

Nodes that postpone execution until all upstream paths complete:

```python
graph.add_node("aggregator", agg_fn, defer=True)
```

### Deprecation: langgraph.prebuilt

In v2.0, `langgraph.prebuilt` is deprecated. Prebuilt agents moved to `langchain.agents`:

```python
# Old (deprecated)
from langgraph.prebuilt import create_react_agent

# New (v2.0)
from langchain.agents import create_react_agent
```

### Identification
- `from langgraph.types import interrupt, Command, CachePolicy` — v2.0 imports.
- `Command(update={...}, goto="node")` — combined state + routing.
- `interrupt({...})` calls inside node functions — HITL.
- `cache_policy=CachePolicy(...)` on `add_node()` — node caching.
- `defer=True` on `add_node()` — deferred execution.

---

## 9. Memory / Checkpointing

| Checkpointer | Use case |
|---|---|
| `MemorySaver()` | In-memory, development only |
| `SqliteSaver.from_conn_string(":memory:")` | SQLite-backed |
| `PostgresSaver(conn)` | Production persistence |

Thread-based memory:

```python
config = {"configurable": {"thread_id": "session-42"}}
app.invoke(inputs, config)    # state persisted under thread-42
app.invoke(inputs2, config)   # continues same conversation
```

Get / update state externally:

```python
state = app.get_state(config)
app.update_state(config, {"messages": [new_msg]})
```

---

## 10. Decomposition Guide — Extracting CIR from LangGraph

Follow these steps to produce a Common Intermediate Representation:

1. **Locate the state class.** Find the `TypedDict` or `MessagesState` subclass. Each key becomes a CIR data channel. Record reducers.

2. **Inventory nodes.** Search for all `graph.add_node(name, fn)` calls. For each node:
   - Record the node name (first arg).
   - Record the implementing function/class (second arg).
   - Determine the node's role: LLM call, tool execution, routing logic, data transform, sub-graph.
   - Check for v2.0 patterns: `cache_policy=` on add_node, `defer=True`, guardrail nodes.

3. **Inventory edges.** Collect all `add_edge` and `add_conditional_edges` calls:
   - Static edges map to unconditional CIR transitions.
   - Conditional edges map to CIR branch points; capture the routing function and its return values.
   - Check for `Command(goto=...)` returns in node functions — these are implicit edges in v2.0.

4. **Inventory tools.** Find all `@tool` functions and `BaseTool` subclasses. Record name, description, parameter schema, and which node(s) use them.

5. **Identify LLM bindings.** Find model instantiation (`ChatOpenAI`, `ChatAnthropic`, etc.) and `.bind_tools()` calls. Map each LLM instance to the node(s) that use it.

6. **Map memory.** Check `graph.compile(checkpointer=...)`. Record checkpointer type. Check for `interrupt_before`/`interrupt_after` (pre-v2.0) or `interrupt()` function calls (v2.0).

7. **Check for v2.0 patterns.** Scan for:
   - `interrupt()` calls — human-in-the-loop pause points
   - `Command(update=..., goto=...)` returns — combined state update + routing
   - `CachePolicy` usage — cached node results
   - `defer=True` — deferred nodes
   - Guardrail nodes

8. **Detect architecture pattern.** Classify as ReAct, multi-agent, map-reduce, or custom DAG based on the edge structure.

9. **Emit CIR.** Combine all extracted components into the intermediate representation:
   - `agents[]` -- one per node that invokes an LLM
   - `tools[]` -- one per tool definition
   - `edges[]` -- one per static or conditional edge (including Command-based implicit edges)
   - `state{}` -- schema with channel names, types, and reducers
   - `memory{}` -- checkpointer type and config
   - `hitl{}` -- interrupt points and their payloads (v2.0)
   - `architecture` -- detected pattern label
