# Semantic Kernel (Python) Code Generation Reference

> Target version: semantic-kernel >= 1.x (2025-2026 API)

---

## 1. Required Imports

```python
# Core
from semantic_kernel import Kernel
from semantic_kernel.functions import kernel_function
from semantic_kernel.functions.kernel_arguments import KernelArguments

# OpenAI connector
from semantic_kernel.connectors.ai.open_ai import OpenAIChatCompletion
from semantic_kernel.connectors.ai.open_ai import AzureChatCompletion

# Chat history and completion base
from semantic_kernel.contents.chat_history import ChatHistory
from semantic_kernel.connectors.ai.chat_completion_client_base import ChatCompletionClientBase

# Prompt templates
from semantic_kernel.prompt_template import PromptTemplateConfig

# Agents
from semantic_kernel.agents import ChatCompletionAgent, AgentGroupChat
from semantic_kernel.agents.strategies.termination.termination_strategy import TerminationStrategy
from semantic_kernel.agents.strategies.selection.selection_strategy import SelectionStrategy

# Memory
from semantic_kernel.memory import SemanticTextMemory
```

---

## 2. Kernel Setup Template

```python
kernel = Kernel()

# Option A: OpenAI
kernel.add_service(
    OpenAIChatCompletion(
        service_id="chat",
        ai_model_id="gpt-4o",
        api_key="YOUR_KEY",
    )
)

# Option B: Azure OpenAI
kernel.add_service(
    AzureChatCompletion(
        service_id="chat",
        deployment_name="gpt-4o",
        endpoint="https://YOUR.openai.azure.com/",
        api_key="YOUR_KEY",
        api_version="2024-06-01",
    )
)
```

---

## 3. Plugin Class Template

```python
class WeatherPlugin:
    """Plugin that provides weather information."""

    @kernel_function(
        name="get_weather",
        description="Gets the current weather for a given city.",
    )
    def get_weather(self, city: str) -> str:
        return f"The weather in {city} is 72F and sunny."

    @kernel_function(
        name="get_forecast",
        description="Gets the 5-day forecast for a given city.",
    )
    def get_forecast(self, city: str, days: int = 5) -> str:
        return f"{days}-day forecast for {city}: sunny throughout."
```

### Registering a Plugin

```python
kernel.add_plugin(WeatherPlugin(), plugin_name="weather")
```

---

## 4. Function Invocation Template

```python
result = await kernel.invoke(
    plugin_name="weather",
    function_name="get_weather",
    arguments=KernelArguments(city="Seattle"),
)
print(result)
```

---

## 5. Chat Completion Template

```python
chat_service: ChatCompletionClientBase = kernel.get_service(type=ChatCompletionClientBase)

chat_history = ChatHistory()
chat_history.add_system_message("You are a helpful assistant.")
chat_history.add_user_message("What is Semantic Kernel?")

response = await chat_service.get_chat_message_contents(
    chat_history=chat_history,
    settings=chat_service.get_prompt_execution_settings_class()(
        service_id="chat",
        temperature=0.7,
    ),
    kernel=kernel,
)
print(response[0].content)
```

---

## 6. Memory Template

```python
from semantic_kernel.connectors.ai.open_ai import OpenAITextEmbedding
from semantic_kernel.memory import SemanticTextMemory, VolatileMemoryStore

embedding_service = OpenAITextEmbedding(
    ai_model_id="text-embedding-3-small",
    api_key="YOUR_KEY",
)

memory = SemanticTextMemory(
    storage=VolatileMemoryStore(),
    embeddings_generator=embedding_service,
)

# Save and recall
await memory.save_information(
    collection="docs",
    id="doc1",
    text="Semantic Kernel is an SDK for AI orchestration.",
)

results = await memory.search(collection="docs", query="What is SK?", limit=3)
for r in results:
    print(r.text, r.relevance)
```

---

## 7. Prompt Function Template

```python
prompt_config = PromptTemplateConfig(
    template="Summarize the following text: {{$input}}",
    description="Summarizes text",
    input_variables=[
        {"name": "input", "description": "Text to summarize"},
    ],
)

summary_fn = kernel.add_function(
    plugin_name="text",
    function_name="summarize",
    prompt_template_config=prompt_config,
)

result = await kernel.invoke(summary_fn, arguments=KernelArguments(input="Long text..."))
```

---

## 8. Multi-Agent Template (Agent Framework)

```python
agent_reviewer = ChatCompletionAgent(
    kernel=kernel,
    service_id="chat",
    name="Reviewer",
    instructions="You review code for bugs and style issues.",
)

agent_writer = ChatCompletionAgent(
    kernel=kernel,
    service_id="chat",
    name="Writer",
    instructions="You write clean Python code based on requirements.",
)

group_chat = AgentGroupChat(
    agents=[agent_writer, agent_reviewer],
    # Optional: termination and selection strategies
)

await group_chat.add_chat_message(message="Write a fibonacci function.")

async for message in group_chat.invoke():
    print(f"{message.name}: {message.content}")
```

---

## 9. Complete Minimal Example

```python
import asyncio
from semantic_kernel import Kernel
from semantic_kernel.functions import kernel_function
from semantic_kernel.functions.kernel_arguments import KernelArguments
from semantic_kernel.connectors.ai.open_ai import OpenAIChatCompletion

class MathPlugin:
    @kernel_function(name="add", description="Adds two numbers.")
    def add(self, a: int, b: int) -> str:
        return str(int(a) + int(b))

async def main():
    kernel = Kernel()
    kernel.add_service(
        OpenAIChatCompletion(service_id="chat", ai_model_id="gpt-4o", api_key="YOUR_KEY")
    )
    kernel.add_plugin(MathPlugin(), plugin_name="math")

    result = await kernel.invoke(
        plugin_name="math",
        function_name="add",
        arguments=KernelArguments(a=3, b=5),
    )
    print(f"Result: {result}")  # Result: 8

asyncio.run(main())
```

---

## 10. Common Pitfalls

| Pitfall | Fix |
|---|---|
| Forgetting `async`/`await` | Most SK operations are async; use `asyncio.run()` at top level |
| Not registering service before invoke | Call `kernel.add_service(...)` before any chat or function call |
| Missing `service_id` alignment | The `service_id` in `add_service` must match what agents/settings reference |
| Plugin methods not decorated | Every function exposed to the kernel needs `@kernel_function` |
| Passing wrong arg types | `KernelArguments` values are strings by default; cast inside the function |
| Planners deprecated | Stepwise/Action planners are removed; use function calling or Agent Framework instead |
| Old `SKContext` references | `SKContext` no longer exists; use `KernelArguments` |
| Not setting `description` | Without descriptions, the LLM cannot discover plugin functions via function calling |
