# Semantic Kernel Framework Patterns Reference

Use this reference to identify, decompose, and extract CIR from Microsoft Semantic Kernel-based agent code.

---

## 1. Import Fingerprints

Presence of any of these imports confirms a Semantic Kernel codebase:

```python
# Core kernel
import semantic_kernel as sk
from semantic_kernel import Kernel

# Function / plugin decorators
from semantic_kernel.functions import kernel_function
from semantic_kernel.functions import KernelArguments
from semantic_kernel.functions import KernelPlugin

# AI service connectors
from semantic_kernel.connectors.ai.open_ai import AzureChatCompletion
from semantic_kernel.connectors.ai.open_ai import OpenAIChatCompletion
from semantic_kernel.connectors.ai.chat_completion_client_base import ChatCompletionClientBase

# Prompt / template
from semantic_kernel.prompt_template import PromptTemplateConfig
from semantic_kernel.contents import ChatHistory

# Memory
from semantic_kernel.memory import SemanticTextMemory
from semantic_kernel.core_plugins import TextMemoryPlugin

# Agent framework
from semantic_kernel.agents import ChatCompletionAgent, AgentGroupChat
from semantic_kernel.agents.strategies import TerminationStrategy, SelectionStrategy
```

Secondary signals: `@kernel_function` decorators, `KernelArguments`, `kernel.invoke()` calls.

---

## 2. Kernel Patterns

The `Kernel` is the central orchestrator that holds services and plugins.

```python
kernel = Kernel()

# Register an AI service
kernel.add_service(OpenAIChatCompletion(
    service_id="chat",
    ai_model_id="gpt-4o",
    api_key=api_key,
))

# Register an Azure service
kernel.add_service(AzureChatCompletion(
    service_id="azure-chat",
    deployment_name="gpt-4o",
    endpoint=endpoint,
    api_key=api_key,
))
```

### Invocation

```python
# Invoke a specific plugin function
result = await kernel.invoke(
    plugin_name="WriterPlugin",
    function_name="summarize",
    arguments=KernelArguments(input=text),
)

# Invoke a function directly
result = await kernel.invoke(my_function, input="Hello")
```

---

## 3. Plugin Patterns

Plugins are classes with one or more `@kernel_function`-decorated methods.

```python
class WeatherPlugin:
    @kernel_function(
        description="Gets the weather for a given city",
        name="get_weather",
    )
    def get_weather(self, city: str) -> str:
        """Get weather for a city."""
        return f"The weather in {city} is sunny."

    @kernel_function(
        description="Gets the forecast for the next N days",
        name="get_forecast",
    )
    def get_forecast(self, city: str, days: int = 3) -> str:
        return f"{days}-day forecast for {city}: clear skies."
```

### Registering plugins

```python
# From an object instance
kernel.add_plugin(WeatherPlugin(), plugin_name="Weather")

# From a directory (prompt plugins with skprompt.txt + config.json)
kernel.add_plugin(parent_directory="./plugins", plugin_name="WriterPlugin")

# Multiple plugins at once
kernel.add_plugins({"Weather": WeatherPlugin(), "Math": MathPlugin()})
```

### Identification rules
- Look for classes whose methods carry `@kernel_function(...)`.
- `plugin_name` in `add_plugin()` determines the namespace.
- `function_name` in the decorator (or the method name) identifies the callable.
- Docstrings and `description=` provide semantic metadata for the AI planner.

---

## 4. Function Patterns

### KernelFunction decorator

```python
@kernel_function(
    description="Translate text to the target language",
    name="translate",
)
async def translate(self, text: str, language: str = "French") -> str:
    # Function body
    return translated_text
```

### KernelArguments

```python
arguments = KernelArguments(
    input="Hello world",
    language="Spanish",
    settings=PromptExecutionSettings(temperature=0.7),
)
result = await kernel.invoke(plugin_name="Translator", function_name="translate", arguments=arguments)
```

### Prompt functions (inline)

```python
prompt_function = kernel.add_function(
    prompt="Summarize this text in {{$style}}: {{$input}}",
    plugin_name="Writer",
    function_name="summarize",
    prompt_template_settings=PromptTemplateConfig(
        template_format="semantic-kernel",
    ),
)
```

---

## 5. Memory and Connectors

### Chat history

```python
from semantic_kernel.contents import ChatHistory

history = ChatHistory()
history.add_system_message("You are a helpful assistant.")
history.add_user_message("What is Semantic Kernel?")

result = await chat_service.get_chat_message_content(
    chat_history=history,
    settings=request_settings,
    kernel=kernel,
)
history.add_assistant_message(str(result))
```

### Semantic text memory

```python
memory = SemanticTextMemory(storage=store, embeddings_generator=embedding_service)
await memory.save_information(collection="docs", id="doc1", text="SK is a framework...")
results = await memory.search(collection="docs", query="What is SK?", limit=3)

# As a plugin
kernel.add_plugin(TextMemoryPlugin(memory), plugin_name="memory")
```

---

## 6. Planner Patterns

Planners auto-compose plugin functions to satisfy a user goal.

```python
# Function-calling stepwise planner (recommended)
from semantic_kernel.planners import FunctionCallingStepwisePlanner

planner = FunctionCallingStepwisePlanner(service_id="chat", max_iterations=10)
result = await planner.invoke(kernel, question="Plan a weekend trip to Paris")

# Handlebars planner (template-based)
from semantic_kernel.planners import HandlebarsPlanner

planner = HandlebarsPlanner(service_id="chat")
plan = await planner.create_plan(kernel, goal="Write and email a summary")
result = await plan.invoke(kernel)
```

### Identification
- Look for `FunctionCallingStepwisePlanner` or `HandlebarsPlanner` imports.
- Planners wrap the kernel and automatically select/sequence plugin functions.

---

## 7. Agent Framework

Semantic Kernel provides an agent abstraction layer on top of the kernel.

### ChatCompletionAgent

```python
from semantic_kernel.agents import ChatCompletionAgent

agent = ChatCompletionAgent(
    kernel=kernel,
    service_id="chat",
    name="Researcher",
    instructions="You are a research assistant. Use available tools to find information.",
)

response = await agent.invoke(chat_history)
```

### AgentGroupChat (multi-agent collaboration)

```python
from semantic_kernel.agents import AgentGroupChat
from semantic_kernel.agents.strategies.termination import MaxIterationTerminationStrategy

researcher = ChatCompletionAgent(kernel=kernel, name="Researcher", instructions="...")
writer = ChatCompletionAgent(kernel=kernel, name="Writer", instructions="...")

group_chat = AgentGroupChat(
    agents=[researcher, writer],
    termination_strategy=MaxIterationTerminationStrategy(max_iterations=10),
)

await group_chat.add_chat_message(message="Write an article about AI agents")
async for response in group_chat.invoke():
    print(f"{response.name}: {response.content}")
```

### Identification
- `ChatCompletionAgent` -- single agent with a kernel, tools, and instructions.
- `AgentGroupChat` -- orchestrated multi-agent conversation with termination/selection strategies.
- Strategies control turn-taking (`SelectionStrategy`) and stopping (`TerminationStrategy`).

---

## 8. Decomposition Guide -- Extracting CIR from Semantic Kernel

Follow these steps to produce a Common Intermediate Representation:

1. **Locate the Kernel.** Find `Kernel()` instantiation. Note which AI services are added via `add_service()` and their `service_id` values.

2. **Inventory plugins.** Search for all `kernel.add_plugin(...)` calls. For each plugin:
   - Record the plugin name (from `plugin_name=`).
   - Find the plugin class and list all `@kernel_function` methods.
   - Record each function's name, description, and parameters.

3. **Inventory prompt functions.** Search for `kernel.add_function(prompt=...)`. Record the template, plugin/function names, and template variables (`{{$var}}`).

4. **Map AI services.** List all `add_service()` calls. Record the service type (OpenAI, Azure, etc.), model ID, and service ID. Map each service to the agents/planners that reference it.

5. **Identify orchestration.** Determine how functions are composed:
   - **Direct invocation**: `kernel.invoke(plugin_name, function_name)` -- map as sequential CIR steps.
   - **Planner**: `FunctionCallingStepwisePlanner` or `HandlebarsPlanner` -- map as dynamic routing.
   - **Agent**: `ChatCompletionAgent` -- map as a CIR agent with bound tools.
   - **AgentGroupChat**: map as multi-agent CIR with turn strategies.

6. **Map memory.** Check for `ChatHistory`, `SemanticTextMemory`, or `TextMemoryPlugin`. Record storage backends.

7. **Detect architecture pattern.** Classify as single-agent, planner-driven, multi-agent chat, or custom orchestration.

8. **Emit CIR.** Combine all extracted components:
   - `agents[]` -- one per ChatCompletionAgent or per kernel invocation path with an LLM
   - `tools[]` -- one per `@kernel_function` method
   - `edges[]` -- derived from invocation order, planner logic, or group chat flow
   - `state{}` -- ChatHistory contents and KernelArguments
   - `memory{}` -- memory plugin config and storage backend
   - `architecture` -- detected pattern label
