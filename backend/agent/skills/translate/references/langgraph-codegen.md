# LangGraph Code Generation Reference

> Target: langgraph >= 2.0 (LangChain ecosystem, 2025-2026)

---

## 1. Required Imports

```python
from typing import Annotated, TypedDict, Literal
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition  # NOTE: langgraph.prebuilt deprecated in v2.0
from langgraph.types import interrupt, Command, CachePolicy  # v2.0
from langgraph.checkpoint.memory import MemorySaver
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import tool
```

---

## 2. State Definition Template

```python
class State(TypedDict):
    messages: Annotated[list, add_messages]
    # add custom keys as needed
    context: str
    iteration_count: int
```

The `Annotated[list, add_messages]` reducer appends new messages instead of replacing the list. Without a reducer, the value is overwritten on each node return.

For custom reducers:

```python
import operator

class State(TypedDict):
    messages: Annotated[list, add_messages]
    items: Annotated[list, operator.add]   # append-style reducer
    final_answer: str                       # overwrite-style (no reducer)
```

---

## 3. Node Function Template

```python
def my_node(state: State) -> dict:
    """Each node receives the full state and returns a partial update dict."""
    messages = state["messages"]
    # Do work...
    result = llm.invoke(messages)
    return {"messages": [result]}
```

Key rules:
- The return dict is **merged** into state using the defined reducers.
- Only return keys you want to update.
- Node functions must accept `state` as the sole positional argument.

---

## 4. Tool Node Template

```python
@tool
def search(query: str) -> str:
    """Search the web for information."""
    return f"Results for: {query}"

@tool
def calculator(expression: str) -> str:
    """Evaluate a math expression."""
    return str(eval(expression))

tools = [search, calculator]
llm_with_tools = ChatOpenAI(model="gpt-4o").bind_tools(tools)
tool_node = ToolNode(tools)
```

---

## 5. Graph Assembly Template

```python
graph_builder = StateGraph(State)

# Add nodes
graph_builder.add_node("agent", agent_node)
graph_builder.add_node("tools", tool_node)

# Add edges
graph_builder.add_edge(START, "agent")
graph_builder.add_edge("tools", "agent")

# Add conditional edges
graph_builder.add_conditional_edges("agent", should_continue)

# Compile
graph = graph_builder.compile()
```

---

## 6. Conditional Routing Template

```python
def should_continue(state: State) -> Literal["tools", "__end__"]:
    """Route based on whether the last message has tool calls."""
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "tools"
    return "__end__"

graph_builder.add_conditional_edges(
    "agent",
    should_continue,
    {
        "tools": "tools",
        "__end__": END,
    },
)
```

Or use the prebuilt `tools_condition` shortcut:

```python
graph_builder.add_conditional_edges("agent", tools_condition)
```

---

## 7. ReAct Loop Template

```python
def agent_node(state: State) -> dict:
    response = llm_with_tools.invoke(state["messages"])
    return {"messages": [response]}

graph_builder = StateGraph(State)
graph_builder.add_node("agent", agent_node)
graph_builder.add_node("tools", ToolNode(tools))

graph_builder.add_edge(START, "agent")
graph_builder.add_conditional_edges("agent", tools_condition)
graph_builder.add_edge("tools", "agent")

graph = graph_builder.compile()
```

This creates the standard cycle: START -> agent -> (tools -> agent)* -> END

---

## 8. Multi-Agent Template

```python
def researcher_node(state: State) -> dict:
    system = SystemMessage(content="You are a research specialist.")
    response = llm_with_tools.invoke([system] + state["messages"])
    return {"messages": [response]}

def writer_node(state: State) -> dict:
    system = SystemMessage(content="You are a writing specialist.")
    response = llm.invoke([system] + state["messages"])
    return {"messages": [response]}

def router(state: State) -> Literal["researcher", "writer", "__end__"]:
    last = state["messages"][-1]
    if "RESEARCH" in last.content:
        return "researcher"
    elif "WRITE" in last.content:
        return "writer"
    return "__end__"

graph_builder = StateGraph(State)
graph_builder.add_node("researcher", researcher_node)
graph_builder.add_node("writer", writer_node)
graph_builder.add_node("tools", ToolNode(tools))

graph_builder.add_edge(START, "researcher")
graph_builder.add_conditional_edges("researcher", router)
graph_builder.add_edge("tools", "researcher")
graph_builder.add_edge("writer", END)

graph = graph_builder.compile()
```

For sub-graphs, compile a separate StateGraph and add it as a node:

```python
sub_graph = StateGraph(State)
# ... build sub-graph ...
compiled_sub = sub_graph.compile()

parent = StateGraph(State)
parent.add_node("sub_agent", compiled_sub)
```

---

## 9. Memory / Checkpointing Template

```python
from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()
graph = graph_builder.compile(checkpointer=checkpointer)

# Every invocation requires a thread_id
config = {"configurable": {"thread_id": "user-session-42"}}
result = graph.invoke({"messages": [HumanMessage(content="Hello")]}, config)

# Subsequent calls with the same thread_id resume from saved state
result = graph.invoke({"messages": [HumanMessage(content="Follow up")]}, config)
```

`MemorySaver` is in-memory only (development/testing). For production, use persistent checkpointers (PostgreSQL, Redis, etc.).

---

## 10. Command Pattern Template (v2.0)

```python
from langgraph.types import Command

def routing_node(state: State) -> Command:
    """Node that updates state and controls routing in one return."""
    if state["needs_review"]:
        return Command(update={"status": "reviewing"}, goto="reviewer")
    return Command(update={"status": "done"}, goto="__end__")

# Register the node normally
graph_builder.add_node("router", routing_node)
# No need for add_conditional_edges — Command.goto handles routing
graph_builder.add_edge("previous_node", "router")
```

---

## 11. Human-in-the-Loop Template (v2.0)

```python
from langgraph.types import interrupt, Command

def approval_node(state: State) -> Command:
    """Pause execution for human approval."""
    user_input = interrupt({
        "question": "Approve this action?",
        "data": state["proposal"],
    })
    if user_input["approved"]:
        return Command(goto="execute")
    return Command(update={"feedback": user_input["reason"]}, goto="revise")

# Requires a checkpointer to persist state during interruption
graph = graph_builder.compile(checkpointer=MemorySaver())
```

---

## 12. Node Caching Template (v2.0)

```python
from langgraph.types import CachePolicy

# Cache expensive node results with a TTL (number of graph super-steps)
graph_builder.add_node(
    "expensive_lookup",
    lookup_node,
    cache_policy=CachePolicy(ttl=3),
)
```

---

## 13. Entry Point Template

```python
# Invoke (blocking, returns final state)
result = graph.invoke({"messages": [HumanMessage(content="What is 2+2?")]})
print(result["messages"][-1].content)

# Stream (yields state updates per node)
for event in graph.stream({"messages": [HumanMessage(content="What is 2+2?")]}):
    for node_name, state_update in event.items():
        print(f"[{node_name}]", state_update)

# Stream with events (fine-grained token streaming)
async for event in graph.astream_events(
    {"messages": [HumanMessage(content="What is 2+2?")]},
    version="v2",
):
    print(event)
```

---

## 14. Complete Minimal Example

```python
from typing import Annotated, TypedDict, Literal
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from langchain_core.tools import tool


@tool
def get_weather(city: str) -> str:
    """Get the current weather for a city."""
    return f"The weather in {city} is sunny, 72F."


class State(TypedDict):
    messages: Annotated[list, add_messages]


tools = [get_weather]
llm = ChatOpenAI(model="gpt-4o").bind_tools(tools)


def agent(state: State) -> dict:
    response = llm.invoke(state["messages"])
    return {"messages": [response]}


graph_builder = StateGraph(State)
graph_builder.add_node("agent", agent)
graph_builder.add_node("tools", ToolNode(tools))
graph_builder.add_edge(START, "agent")
graph_builder.add_conditional_edges("agent", tools_condition)
graph_builder.add_edge("tools", "agent")

graph = graph_builder.compile()

result = graph.invoke({"messages": [HumanMessage(content="What's the weather in Paris?")]})
print(result["messages"][-1].content)
```

---

## 15. Common Pitfalls

| Pitfall | Fix |
|---|---|
| Returning a `list` instead of `dict` from a node | Nodes must return `dict` with state keys (or `Command` in v2.0) |
| Forgetting `add_messages` reducer | Messages get overwritten instead of appended |
| Missing edge from `tools` back to `agent` | Tool results never reach the LLM; graph hangs |
| Using `END` as a string `"END"` | Import and use the `END` sentinel from `langgraph.graph` |
| No `START` edge | Graph has no entry point; raises error on compile |
| Passing `State` class instead of instance to `invoke` | `invoke` takes a dict, not a TypedDict class |
| Not binding tools to the model | `tools_condition` checks `tool_calls`; unbound model never emits them |
| Infinite loops | Add a max-iteration check in the routing function or state |
| Forgetting `thread_id` with checkpointer | Raises error; every call needs `{"configurable": {"thread_id": ...}}` |
| Mutating state directly in a node | Always return a new dict; do not modify `state` in place |
| Using old `interrupt_before`/`interrupt_after` | In v2.0, use `interrupt()` function inside node instead |
| Using `langgraph.prebuilt` (deprecated in v2.0) | Import from `langchain.agents` instead |
| Forgetting `Command` import when using `goto` | `from langgraph.types import Command` is required |
| `Command.goto` without checkpointer | `interrupt()` requires a checkpointer to persist state during pause |
