# AutoGen / AG2 -- Framework Pattern Reference

> Reference for the framework-translator-agent's analyze skill.
> Covers both legacy AutoGen 0.2.x and the rewritten AutoGen 0.4+ (also known as AG2).

---

## 1. Import Fingerprints

### Legacy (0.2.x)

```python
import autogen
from autogen import AssistantAgent, UserProxyAgent, ConversableAgent
from autogen import GroupChat, GroupChatManager
from autogen import config_list_from_json
```

### New API (0.4+)

```python
from autogen_agentchat.agents import AssistantAgent, UserProxyAgent
from autogen_agentchat.teams import RoundRobinGroupChat, SelectorGroupChat
from autogen_agentchat.conditions import TextMentionTermination, MaxMessageTermination
from autogen_ext.models.openai import OpenAIChatCompletionClient
from autogen_core import CancellationToken
```

Key discriminator: `autogen_agentchat` and `autogen_core` imports indicate 0.4+;
plain `autogen` with `ConversableAgent` indicates 0.2.x.

---

## 2. Agent Patterns

### Legacy (0.2.x)

```python
import autogen

llm_config = {"model": "gpt-4", "api_key": "sk-..."}

assistant = autogen.AssistantAgent(
    name="assistant",
    system_message="You are a helpful coding assistant.",
    llm_config=llm_config,
)

user_proxy = autogen.UserProxyAgent(
    name="user_proxy",
    human_input_mode="NEVER",          # NEVER | TERMINATE | ALWAYS
    code_execution_config={"work_dir": "coding", "use_docker": False},
    max_consecutive_auto_reply=10,
    is_termination_msg=lambda msg: "TERMINATE" in msg.get("content", ""),
)
```

`ConversableAgent` is the base class for both `AssistantAgent` and `UserProxyAgent`.

### New API (0.4+)

```python
from autogen_agentchat.agents import AssistantAgent
from autogen_ext.models.openai import OpenAIChatCompletionClient

model_client = OpenAIChatCompletionClient(model="gpt-4o")

assistant = AssistantAgent(
    name="assistant",
    model_client=model_client,
    system_message="You are a helpful coding assistant.",
    tools=[my_tool_function],
)
```

In 0.4+, `UserProxyAgent` exists but is simplified. The model client is a
separate object, not an inline dict.

---

## 3. GroupChat Patterns

### Legacy (0.2.x)

```python
groupchat = autogen.GroupChat(
    agents=[user_proxy, coder, reviewer],
    messages=[],
    max_round=12,
    speaker_selection_method="auto",   # "auto" | "round_robin" | "random" | "manual" | callable
    allow_repeat_speaker=False,
)

manager = autogen.GroupChatManager(
    groupchat=groupchat,
    llm_config=llm_config,
)

user_proxy.initiate_chat(manager, message="Build a snake game in Python.")
```

The `GroupChatManager` orchestrates turn-taking: it selects the next speaker,
forwards the message, and broadcasts the response.

### New API (0.4+)

```python
from autogen_agentchat.teams import RoundRobinGroupChat, SelectorGroupChat
from autogen_agentchat.conditions import TextMentionTermination, MaxMessageTermination

# Round-robin team
termination = MaxMessageTermination(max_messages=10)
team = RoundRobinGroupChat(
    participants=[coder, reviewer],
    termination_condition=termination,
)

# Selector-based team (LLM picks next speaker)
team = SelectorGroupChat(
    participants=[coder, reviewer, planner],
    model_client=model_client,
    termination_condition=TextMentionTermination("APPROVE"),
)

# Run the team
result = await team.run(task="Build a snake game in Python.")
```

In 0.4+, `GroupChat` is replaced by team classes. `RoundRobinGroupChat` covers
round-robin, and `SelectorGroupChat` covers LLM-based selection (equivalent to
`speaker_selection_method="auto"` in 0.2).

---

## 4. Tool / Function Patterns

### Legacy (0.2.x)

```python
# Method 1: function_map on agent
assistant = autogen.AssistantAgent(
    name="assistant",
    llm_config={
        "model": "gpt-4",
        "functions": [
            {
                "name": "get_weather",
                "description": "Get current weather for a city.",
                "parameters": {
                    "type": "object",
                    "properties": {"city": {"type": "string"}},
                    "required": ["city"],
                },
            }
        ],
    },
)

user_proxy = autogen.UserProxyAgent(
    name="user_proxy",
    function_map={"get_weather": get_weather_impl},
)

# Method 2: register_function (preferred in late 0.2.x)
from autogen import register_function

register_function(
    get_weather_impl,
    caller=assistant,      # agent that calls the function
    executor=user_proxy,   # agent that executes it
    name="get_weather",
    description="Get current weather for a city.",
)
```

### New API (0.4+)

```python
# Tools are plain Python functions passed directly
def get_weather(city: str) -> str:
    """Get current weather for a city."""
    return weather_api.fetch(city)

assistant = AssistantAgent(
    name="weather_bot",
    model_client=model_client,
    tools=[get_weather],
)
```

In 0.4+, tools are Python callables with type hints and docstrings. The
framework auto-generates the schema -- no manual JSON schema needed.

---

## 5. Conversation Patterns

### Legacy (0.2.x)

```python
# Two-agent chat
user_proxy.initiate_chat(assistant, message="Solve x^2 - 4 = 0.")

# Nested chat (sequential sub-conversations)
user_proxy.register_nested_chats(
    [
        {"recipient": reviewer, "message": "Review the code.", "max_turns": 3},
        {"recipient": tester, "message": "Test the code.", "max_turns": 2},
    ],
    trigger=assistant,
)
```

### New API (0.4+)

```python
# Single-agent run
result = await assistant.run(task="Solve x^2 - 4 = 0.")

# Team run
result = await team.run(task="Build and test a calculator.")

# Streaming
async for message in team.run_stream(task="Build a calculator."):
    print(message)
```

The 0.4+ API is async-first. `run()` and `run_stream()` replace `initiate_chat()`.

---

## 6. Code Execution

### Legacy (0.2.x)

```python
user_proxy = autogen.UserProxyAgent(
    name="executor",
    code_execution_config={
        "work_dir": "workspace",
        "use_docker": True,           # or False for local
        "timeout": 60,
        "last_n_messages": 3,
    },
)
```

When `use_docker=True`, code runs in an isolated Docker container. When `False`,
it executes locally in `work_dir`.

### New API (0.4+)

```python
from autogen_ext.code_executors.docker import DockerCommandLineCodeExecutor
from autogen_ext.code_executors.local import LocalCommandLineCodeExecutor

code_executor = DockerCommandLineCodeExecutor(work_dir="workspace")
# or
code_executor = LocalCommandLineCodeExecutor(work_dir="workspace")

agent = CodeExecutorAgent(name="executor", code_executor=code_executor)
```

In 0.4+, code executors are explicit, pluggable components rather than
config dicts.

---

## 7. LLM Config

### Legacy (0.2.x)

```python
# Inline config
llm_config = {
    "model": "gpt-4",
    "api_key": "sk-...",
    "temperature": 0,
}

# Config list (multiple models / endpoints)
config_list = autogen.config_list_from_json(
    "OAI_CONFIG_LIST",
    filter_dict={"model": ["gpt-4", "gpt-4o"]},
)
llm_config = {"config_list": config_list, "temperature": 0}

assistant = autogen.AssistantAgent(name="a", llm_config=llm_config)
```

The `OAI_CONFIG_LIST` env var or JSON file holds a list of
`{"model": ..., "api_key": ..., "base_url": ...}` entries.

### New API (0.4+)

```python
from autogen_ext.models.openai import OpenAIChatCompletionClient

model_client = OpenAIChatCompletionClient(
    model="gpt-4o",
    # api_key sourced from OPENAI_API_KEY env var by default
)
```

In 0.4+, `llm_config` dicts are replaced by typed model client objects.
Multiple providers are supported via different client classes
(e.g., `AzureOpenAIChatCompletionClient`).

---

## 8. Speaker Selection

### Legacy (0.2.x)

| Method | Behavior |
|---|---|
| `"auto"` | LLM picks the next speaker (default) |
| `"round_robin"` | Agents speak in list order |
| `"random"` | Random selection |
| `"manual"` | Human chooses via input prompt |
| callable | Custom function `(last_speaker, groupchat) -> Agent` |

```python
def custom_speaker(last_speaker, groupchat):
    if last_speaker == coder:
        return reviewer
    return coder

groupchat = autogen.GroupChat(
    agents=[coder, reviewer],
    speaker_selection_method=custom_speaker,
)
```

### New API (0.4+)

Speaker selection is handled by the team class choice:

- `RoundRobinGroupChat` -- fixed round-robin order.
- `SelectorGroupChat` -- LLM-based selection with an optional
  `selector_prompt` to guide the choice.

Custom selection logic can be implemented via `selector_func` on
`SelectorGroupChat` or by building a custom team on `autogen_core`.

---

## 9. CIR Decomposition Guide

When translating an AutoGen project to CIR, extract:

### Agents (CIR nodes)
- Each `AssistantAgent(...)` or `ConversableAgent(...)` becomes a CIR agent node.
- `system_message` maps to `system_prompt`.
- `llm_config` (0.2) or `model_client` (0.4) maps to `model_id` + `model_params`.
- `UserProxyAgent` with code execution maps to a CIR executor node, not a
  standard agent node.

### Tools (CIR capabilities)
- `function_map` entries (0.2) and `tools` list (0.4) become CIR tool defs.
- `register_function()` calls link a tool to both a caller agent and an
  executor agent -- capture this dual binding in CIR.

### Routing (CIR edges)
- Two-agent `initiate_chat()` = simple edge between two CIR nodes.
- `GroupChat` / team classes define a routing topology:
  - `round_robin` = CIR sequential pipeline.
  - `auto` / `SelectorGroupChat` = CIR dynamic routing node.
  - Custom speaker function = CIR conditional routing with logic.
- `register_nested_chats()` = CIR sub-graph / nested workflow.

### Termination (CIR constraints)
- `is_termination_msg` (0.2) maps to CIR `stop_conditions`.
- `MaxMessageTermination`, `TextMentionTermination` (0.4) map to CIR
  `max_iterations` and `stop_pattern` respectively.
- `max_round` (0.2) and `max_messages` (0.4) = CIR `max_iterations`.

### Code Execution (CIR runtime)
- `code_execution_config` (0.2) or `CodeExecutorAgent` (0.4) maps to
  CIR `execution_environment` metadata.
- Docker vs local = CIR `sandbox_type`.

### Common decomposition pitfalls
- In 0.2, the `UserProxyAgent` plays dual roles (human proxy + code executor).
  Separate these into distinct CIR nodes.
- `function_map` binds execution to the proxy, not the assistant -- the
  CIR tool definition must reference the correct executor.
- Nested chats create implicit sub-workflows; flatten these into explicit
  CIR sub-graphs with entry/exit edges.
- Speaker selection functions contain routing logic that must be extracted
  as CIR edge conditions, not discarded.
- Version detection (0.2 vs 0.4) must happen first since the CIR mapping
  differs substantially between versions.
