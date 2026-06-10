# AutoGen -- Code Generation Reference

> Two major API surfaces exist: **Legacy (0.2.x)** and **New (0.4+/stable)**.
> Legacy uses `pyautogen` or `autogen` package. New uses `autogen-agentchat` + `autogen-core` packages.
> Most existing code in the wild uses 0.2.x. New projects should target 0.4+.

---

## 1. Required Imports

### Legacy (0.2.x)

```python
import autogen
from autogen import (
    AssistantAgent,
    UserProxyAgent,
    ConversableAgent,
    GroupChat,
    GroupChatManager,
    config_list_from_json,
)
```

### New (0.4+ / stable)

```python
from autogen_agentchat.agents import AssistantAgent, UserProxyAgent
from autogen_agentchat.teams import (
    RoundRobinGroupChat,
    SelectorGroupChat,
)
from autogen_agentchat.conditions import (
    TextMentionTermination,
    MaxMessageTermination,
)
from autogen_agentchat.ui import Console
from autogen_ext.models.openai import OpenAIChatCompletionClient
from autogen_core.tools import FunctionTool
```

---

## 2. Agent Templates

### Legacy (0.2.x)

```python
# AssistantAgent -- LLM-powered agent
assistant = autogen.AssistantAgent(
    name="assistant",
    llm_config=llm_config,
    system_message="You are a helpful AI assistant.",
)

# UserProxyAgent -- human or automated proxy that can execute code
user_proxy = autogen.UserProxyAgent(
    name="user_proxy",
    human_input_mode="NEVER",       # "ALWAYS" | "TERMINATE" | "NEVER"
    max_consecutive_auto_reply=10,
    is_termination_msg=lambda msg: "TERMINATE" in msg.get("content", ""),
    code_execution_config={
        "work_dir": "coding",
        "use_docker": False,
    },
)

# ConversableAgent -- base class, fully customizable
agent = autogen.ConversableAgent(
    name="custom_agent",
    llm_config=llm_config,
    system_message="You are a custom agent.",
    human_input_mode="NEVER",
)
```

### New (0.4+)

```python
model_client = OpenAIChatCompletionClient(model="gpt-4o")

assistant = AssistantAgent(
    name="assistant",
    model_client=model_client,
    system_message="You are a helpful AI assistant.",
    tools=[my_tool],                    # list of FunctionTool or callables
    description="A general-purpose assistant.",  # used by SelectorGroupChat
)

user_proxy = UserProxyAgent(
    name="user_proxy",
    description="A human user.",
)
```

---

## 3. LLM Config Template (Legacy 0.2.x)

```python
# Option A: Inline config
llm_config = {
    "config_list": [
        {
            "model": "gpt-4o",
            "api_key": "sk-...",
        }
    ],
    "temperature": 0.7,
    "timeout": 120,
}

# Option B: From environment / JSON file (OAI_CONFIG_LIST)
config_list = autogen.config_list_from_json(
    "OAI_CONFIG_LIST",
    filter_dict={"model": ["gpt-4o", "gpt-4o-mini"]},
)
llm_config = {"config_list": config_list}

# Option C: From env var directly
config_list = autogen.config_list_from_models(
    model_list=["gpt-4o"],
)
```

### New (0.4+) -- Model Client

```python
from autogen_ext.models.openai import OpenAIChatCompletionClient

# Reads OPENAI_API_KEY from environment by default
model_client = OpenAIChatCompletionClient(model="gpt-4o")
```

---

## 4. Tool Registration Template

### Legacy (0.2.x)

```python
# Define the function
def search_web(query: str) -> str:
    """Search the web for information."""
    return f"Results for: {query}"

# Register for LLM (so the model knows the tool exists)
assistant.register_for_llm(description="Search the web")(search_web)

# Register for execution (so UserProxy can run it)
user_proxy.register_for_execution()(search_web)

# Alternative: register on ConversableAgent
@user_proxy.register_for_execution()
@assistant.register_for_llm(description="Search the web")
def search_web(query: str) -> str:
    return f"Results for: {query}"
```

### New (0.4+)

```python
from autogen_core.tools import FunctionTool

def search_web(query: str) -> str:
    """Search the web for information."""
    return f"Results for: {query}"

search_tool = FunctionTool(search_web, description="Search the web")

assistant = AssistantAgent(
    name="assistant",
    model_client=model_client,
    tools=[search_tool],
)
```

---

## 5. Two-Agent Chat Template

### Legacy (0.2.x)

```python
user_proxy = autogen.UserProxyAgent(
    name="user_proxy",
    human_input_mode="NEVER",
    max_consecutive_auto_reply=5,
    is_termination_msg=lambda msg: "TERMINATE" in msg.get("content", ""),
    code_execution_config={"work_dir": "output", "use_docker": False},
)

assistant = autogen.AssistantAgent(
    name="assistant",
    llm_config=llm_config,
)

# Start the conversation
user_proxy.initiate_chat(
    assistant,
    message="Write a Python function to calculate fibonacci numbers.",
)
```

### New (0.4+)

```python
import asyncio
from autogen_agentchat.teams import RoundRobinGroupChat
from autogen_agentchat.conditions import TextMentionTermination
from autogen_agentchat.ui import Console

team = RoundRobinGroupChat(
    participants=[assistant, user_proxy],
    termination_condition=TextMentionTermination("APPROVE"),
)

async def main():
    result = await Console(team.run_stream(task="Write a fibonacci function."))
    print(result)

asyncio.run(main())
```

---

## 6. GroupChat Template

### Legacy (0.2.x)

```python
coder = autogen.AssistantAgent(
    name="coder",
    llm_config=llm_config,
    system_message="You write Python code. Wrap code in ```python blocks.",
)

reviewer = autogen.AssistantAgent(
    name="reviewer",
    llm_config=llm_config,
    system_message="You review code for bugs and improvements.",
)

user_proxy = autogen.UserProxyAgent(
    name="executor",
    human_input_mode="NEVER",
    code_execution_config={"work_dir": "groupchat", "use_docker": False},
    is_termination_msg=lambda msg: "TERMINATE" in msg.get("content", ""),
)

groupchat = autogen.GroupChat(
    agents=[user_proxy, coder, reviewer],
    messages=[],
    max_round=12,
    speaker_selection_method="auto",  # "auto" | "round_robin" | "random" | callable
)

manager = autogen.GroupChatManager(
    groupchat=groupchat,
    llm_config=llm_config,
)

user_proxy.initiate_chat(manager, message="Build a web scraper for news headlines.")
```

### New (0.4+) -- SelectorGroupChat

```python
from autogen_agentchat.teams import SelectorGroupChat
from autogen_agentchat.conditions import MaxMessageTermination

team = SelectorGroupChat(
    participants=[coder_agent, reviewer_agent, executor_agent],
    model_client=model_client,          # used for speaker selection
    termination_condition=MaxMessageTermination(20),
)

result = await Console(team.run_stream(task="Build a web scraper."))
```

---

## 7. Speaker Selection Template (Legacy 0.2.x)

```python
def custom_speaker_selection(
    last_speaker: autogen.Agent,
    groupchat: autogen.GroupChat,
) -> autogen.Agent:
    """Determine the next speaker based on conversation state."""
    messages = groupchat.messages
    agents = groupchat.agents

    # Example: route based on last message content
    last_msg = messages[-1].get("content", "") if messages else ""

    if "write code" in last_msg.lower():
        return next(a for a in agents if a.name == "coder")
    elif "review" in last_msg.lower():
        return next(a for a in agents if a.name == "reviewer")
    else:
        return next(a for a in agents if a.name == "executor")

groupchat = autogen.GroupChat(
    agents=[coder, reviewer, executor],
    messages=[],
    max_round=12,
    speaker_selection_method=custom_speaker_selection,
)
```

### New (0.4+) -- SelectorGroupChat with custom selector

```python
team = SelectorGroupChat(
    participants=[coder_agent, reviewer_agent],
    model_client=model_client,
    selector_prompt="Select the next speaker based on the task at hand.",
    termination_condition=MaxMessageTermination(20),
)
```

---

## 8. Nested Chat Template (Legacy 0.2.x)

```python
# Inner chat: assistant solves a sub-task
inner_assistant = autogen.AssistantAgent(
    name="inner_assistant", llm_config=llm_config
)
inner_proxy = autogen.UserProxyAgent(
    name="inner_proxy", human_input_mode="NEVER",
    code_execution_config={"work_dir": "inner", "use_docker": False},
    is_termination_msg=lambda msg: "TERMINATE" in msg.get("content", ""),
)

# Outer agent triggers nested chat via registered nested chats
outer_assistant = autogen.AssistantAgent(
    name="outer_assistant", llm_config=llm_config
)

# Register a nested chat on the outer assistant
outer_assistant.register_nested_chats(
    [
        {
            "sender": inner_proxy,
            "recipient": inner_assistant,
            "message": "Solve this sub-problem: {message}",
            "max_turns": 5,
            "summary_method": "last_msg",
        }
    ],
    trigger=lambda sender: sender.name == "user_proxy",
)
```

---

## 9. Code Execution Template

### Legacy (0.2.x)

```python
# Local execution (no Docker)
user_proxy = autogen.UserProxyAgent(
    name="executor",
    code_execution_config={
        "work_dir": "workspace",
        "use_docker": False,
        "last_n_messages": 3,       # only look at last N messages for code
        "timeout": 60,              # seconds
    },
)

# Docker execution (recommended for safety)
user_proxy = autogen.UserProxyAgent(
    name="executor",
    code_execution_config={
        "work_dir": "workspace",
        "use_docker": "python:3.11",  # Docker image name
        "timeout": 120,
    },
)
```

### New (0.4+)

```python
from autogen_ext.code_executors.local import LocalCommandLineCodeExecutor
from autogen_ext.code_executors.docker import DockerCommandLineCodeExecutor
from autogen_agentchat.agents import CodeExecutorAgent

# Local executor
local_executor = LocalCommandLineCodeExecutor(work_dir="workspace")
code_agent = CodeExecutorAgent("executor", code_executor=local_executor)

# Docker executor
docker_executor = DockerCommandLineCodeExecutor(
    image="python:3.11", work_dir="workspace"
)
code_agent = CodeExecutorAgent("executor", code_executor=docker_executor)
```

---

## 10. Complete Minimal Example

### Legacy (0.2.x)

```python
import autogen

config_list = [{"model": "gpt-4o", "api_key": "sk-..."}]
llm_config = {"config_list": config_list}

assistant = autogen.AssistantAgent(
    name="assistant",
    llm_config=llm_config,
    system_message="You are a helpful coding assistant. Say TERMINATE when done.",
)

user_proxy = autogen.UserProxyAgent(
    name="user_proxy",
    human_input_mode="NEVER",
    max_consecutive_auto_reply=5,
    is_termination_msg=lambda msg: "TERMINATE" in msg.get("content", ""),
    code_execution_config={"work_dir": "output", "use_docker": False},
)

user_proxy.initiate_chat(assistant, message="Write hello world in Python.")
```

### New (0.4+ / stable)

```python
import asyncio
from autogen_agentchat.agents import AssistantAgent, CodeExecutorAgent
from autogen_agentchat.teams import RoundRobinGroupChat
from autogen_agentchat.conditions import TextMentionTermination
from autogen_agentchat.ui import Console
from autogen_ext.models.openai import OpenAIChatCompletionClient
from autogen_ext.code_executors.local import LocalCommandLineCodeExecutor

model_client = OpenAIChatCompletionClient(model="gpt-4o")

coder = AssistantAgent(
    name="coder",
    model_client=model_client,
    system_message="Write Python code. Say APPROVE when the task is verified.",
)

executor = CodeExecutorAgent(
    "executor",
    code_executor=LocalCommandLineCodeExecutor(work_dir="output"),
)

team = RoundRobinGroupChat(
    participants=[coder, executor],
    termination_condition=TextMentionTermination("APPROVE"),
)

async def main():
    result = await Console(team.run_stream(task="Write hello world in Python."))
    print(result)

asyncio.run(main())
```

---

## 11. Common Pitfalls

| Pitfall | Details |
|---|---|
| **Version confusion (0.2 vs 0.4)** | APIs are completely different. `autogen.AssistantAgent` (0.2) vs `autogen_agentchat.agents.AssistantAgent` (0.4). Import errors are the first sign of version mismatch. |
| **Package naming** | Legacy: `pip install pyautogen`. New: `pip install autogen-agentchat autogen-ext`. The package `autogen` on PyPI may refer to either depending on version. |
| **`OAI_CONFIG_LIST` not found** | Legacy loads config from a JSON file or env var. If missing, agents fail silently or throw. Always verify the file path or env var exists. |
| **`human_input_mode` left as default** | Default is `"ALWAYS"` in legacy, which blocks waiting for terminal input. Set to `"NEVER"` for fully automated workflows. |
| **Termination not configured** | Without `is_termination_msg` (0.2) or a termination condition (0.4), conversations can loop indefinitely. Always set `max_round` or `MaxMessageTermination`. |
| **Code execution with Docker** | If `use_docker=True` (legacy default in some versions) but Docker is not installed, execution fails. Explicitly set `use_docker=False` for local dev. |
| **GroupChat speaker loops** | With `speaker_selection_method="auto"`, the LLM picks next speaker. It may loop between two agents. Use custom selection or `max_round` as a safeguard. |
| **Async vs sync** | Legacy (0.2.x) is synchronous. New (0.4+) is async-first -- must use `asyncio.run()` or `await`. Mixing sync calls with async agents causes hangs. |
| **Tool registration asymmetry (0.2)** | Must register tools on *both* the LLM agent (`register_for_llm`) and the executor agent (`register_for_execution`). Missing either side causes silent failures. |
| **`description` field in 0.4** | `SelectorGroupChat` uses agent `description` (not `system_message`) for speaker selection. Omitting it leads to poor routing. |
| **AG2 fork** | The community fork `ag2` (formerly AutoGen) has diverged. Code from `ag2ai/ag2` may not be compatible with `microsoft/autogen` 0.4. Check which project you are targeting. |
