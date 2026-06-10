# Haystack Framework Patterns Reference

Use this reference to identify, decompose, and extract CIR from Haystack 2.x (deepset) agent code.

---

## 1. Import Fingerprints

Presence of any of these imports confirms a Haystack 2.x codebase:

```python
# Core pipeline
from haystack import Pipeline, Document
from haystack import AsyncPipeline               # async variant
from haystack.components.generators import OpenAIGenerator
from haystack.components.generators.chat import OpenAIChatGenerator

# Prompt building
from haystack.components.builders import PromptBuilder
from haystack.components.builders import ChatPromptBuilder
from haystack.components.builders import AnswerBuilder

# Retrievers and document stores
from haystack.components.retrievers.in_memory import InMemoryBM25Retriever
from haystack.components.retrievers.in_memory import InMemoryEmbeddingRetriever
from haystack.document_stores.in_memory import InMemoryDocumentStore

# Embedders
from haystack.components.embedders import OpenAITextEmbedder
from haystack.components.embedders import OpenAIDocumentEmbedder

# Converters and preprocessors
from haystack.components.converters import TextFileToDocument
from haystack.components.preprocessors import DocumentCleaner, DocumentSplitter

# Routers
from haystack.components.routers import ConditionalRouter, FileTypeRouter

# Component API
from haystack import component
```

Secondary signals: `pipeline.add_component()`, `pipeline.connect()`, `pipeline.run()`, `@component` decorator.

---

## 2. Pipeline Patterns

Pipelines are directed multigraphs of components connected by typed edges.

```python
pipeline = Pipeline()

# Add components (order does not matter)
pipeline.add_component("prompt_builder", PromptBuilder(template=template))
pipeline.add_component("llm", OpenAIGenerator(model="gpt-4o"))
pipeline.add_component("retriever", InMemoryBM25Retriever(document_store=doc_store))

# Connect outputs to inputs
pipeline.connect("retriever.documents", "prompt_builder.documents")
pipeline.connect("prompt_builder.prompt", "llm.prompt")

# Run the pipeline
result = pipeline.run({
    "retriever": {"query": "What is Haystack?"},
    "prompt_builder": {"query": "What is Haystack?"},
})
```

### AsyncPipeline

```python
async_pipeline = AsyncPipeline()
async_pipeline.add_component("llm", OpenAIChatGenerator())
# ... add and connect components ...
result = await async_pipeline.run_async(inputs)
```

### Identification rules
- `Pipeline()` or `AsyncPipeline()` instantiation is the entry point.
- `add_component(name, instance)` registers a named component.
- `connect("source.output", "target.input")` wires typed data flow.
- `run(dict)` executes the graph; keys are component names, values are input dicts.

---

## 3. Component Patterns

### Built-in components

Haystack ships dozens of ready-made components. All follow the same interface: a `run()` method with typed inputs and outputs.

### Custom components

```python
from haystack import component

@component
class TextClassifier:
    @component.output_types(category=str, confidence=float)
    def run(self, text: str) -> dict:
        # classification logic
        return {"category": "positive", "confidence": 0.95}
```

### Component contract
- **`@component`** class decorator -- registers the class as a pipeline component.
- **`@component.output_types(...)`** -- declares output names and types on the `run()` method.
- **`run()` method** -- the only required method; receives typed inputs, returns a dict matching output types.
- Input types are inferred from `run()` parameter annotations.
- Components can have `__init__` for configuration (model names, thresholds, etc.).

### Warm-up pattern

```python
@component
class ModelComponent:
    def __init__(self, model_name: str):
        self.model_name = model_name
        self.model = None

    def warm_up(self):
        """Called once before the first run(); load heavy resources here."""
        self.model = load_model(self.model_name)

    @component.output_types(result=str)
    def run(self, text: str) -> dict:
        return {"result": self.model.predict(text)}
```

---

## 4. Generator Patterns

Generators wrap LLM calls.

```python
# Text generation (prompt in, text out)
from haystack.components.generators import OpenAIGenerator
generator = OpenAIGenerator(model="gpt-4o", api_key=Secret.from_env_var("OPENAI_API_KEY"))

# Chat generation (messages in, messages out)
from haystack.components.generators.chat import OpenAIChatGenerator
chat_gen = OpenAIChatGenerator(model="gpt-4o")

# Anthropic (via haystack-ai extra or integration)
from haystack_integrations.components.generators.anthropic import AnthropicChatGenerator
anthropic_gen = AnthropicChatGenerator(model="claude-sonnet-4-5-20250514")

# Local models
from haystack.components.generators import HuggingFaceLocalGenerator
local_gen = HuggingFaceLocalGenerator(model="mistralai/Mistral-7B-v0.1")
```

### Identification
- `OpenAIGenerator` / `OpenAIChatGenerator` -- OpenAI-backed.
- Integration generators use `haystack_integrations.components.generators.*`.
- `model=` parameter identifies the LLM model.

---

## 5. Retriever Patterns

Retrievers fetch documents from document stores.

```python
# BM25 (keyword) retrieval
from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack.components.retrievers.in_memory import InMemoryBM25Retriever

doc_store = InMemoryDocumentStore()
doc_store.write_documents([Document(content="Haystack is...")])
retriever = InMemoryBM25Retriever(document_store=doc_store, top_k=5)

# Embedding retrieval
from haystack.components.retrievers.in_memory import InMemoryEmbeddingRetriever
embedding_retriever = InMemoryEmbeddingRetriever(document_store=doc_store, top_k=5)

# External stores (via integrations)
from haystack_integrations.document_stores.chroma import ChromaDocumentStore
from haystack_integrations.components.retrievers.chroma import ChromaEmbeddingRetriever
```

### Identification
- Retrievers always pair with a DocumentStore.
- `top_k` controls result count.
- Output is always `documents: List[Document]`.

---

## 6. Builder Patterns

### PromptBuilder

```python
from haystack.components.builders import PromptBuilder

template = """
Given the following documents, answer the question.
Documents:
{% for doc in documents %}
  {{ doc.content }}
{% endfor %}
Question: {{ query }}
Answer:
"""

prompt_builder = PromptBuilder(template=template)
```

### ChatPromptBuilder

```python
from haystack.components.builders import ChatPromptBuilder
from haystack.dataclasses import ChatMessage

messages = [
    ChatMessage.from_system("You are a helpful assistant."),
    ChatMessage.from_user("Summarize: {{ text }}"),
]
chat_builder = ChatPromptBuilder(template=messages)
```

### Identification
- `PromptBuilder` uses Jinja2 templates with `{{ variable }}` and `{% for %}` loops.
- `ChatPromptBuilder` works with `ChatMessage` lists for chat-style prompts.
- Template variables become the component's input parameters.

---

## 7. Router Patterns

### ConditionalRouter

Routes data to different outputs based on Jinja2 conditions.

```python
from haystack.components.routers import ConditionalRouter

routes = [
    {
        "condition": "{{ streams|length > 2 }}",
        "output": "{{ streams }}",
        "output_name": "enough_streams",
        "output_type": List[str],
    },
    {
        "condition": "{{ streams|length <= 2 }}",
        "output": "{{ streams }}",
        "output_name": "insufficient_streams",
        "output_type": List[str],
    },
]
router = ConditionalRouter(routes=routes)
pipeline.add_component("router", router)
pipeline.connect("router.enough_streams", "processor.streams")
pipeline.connect("router.insufficient_streams", "fallback.streams")
```

### FileTypeRouter

```python
from haystack.components.routers import FileTypeRouter

router = FileTypeRouter(mime_types=["text/plain", "application/pdf"])
# Outputs: router.text/plain, router.application/pdf, router.unclassified
```

### Identification
- `ConditionalRouter` -- Jinja2 condition strings with named outputs; used for branching logic.
- `FileTypeRouter` -- routes files by MIME type.
- Router outputs are connected to different downstream components.

---

## 8. Agents (Haystack 2.x)

Haystack 2.x includes an agent abstraction built on top of pipelines.

```python
from haystack.components.agents import Agent
from haystack.dataclasses import ChatMessage

agent = Agent(
    chat_generator=OpenAIChatGenerator(model="gpt-4o"),
    tools=[search_tool, calculator_tool],
    system_prompt="You are a helpful research assistant.",
)

result = agent.run(messages=[ChatMessage.from_user("Find the population of Paris")])
```

### Identification
- `Agent` wraps a chat generator with tool-use capabilities.
- Tools are Haystack `Tool` objects or components exposed as tools.
- Agents can be embedded as components within larger pipelines.

---

## 9. Decomposition Guide -- Extracting CIR from Haystack

Follow these steps to produce a Common Intermediate Representation:

1. **Locate the Pipeline.** Find `Pipeline()` or `AsyncPipeline()` instantiation. This is the top-level orchestrator.

2. **Inventory components.** Search for all `pipeline.add_component(name, instance)` calls. For each component:
   - Record the component name (first arg).
   - Record the component class and its configuration (constructor args).
   - Classify the role: generator, retriever, builder, router, embedder, preprocessor, or custom.

3. **Map connections.** Collect all `pipeline.connect(source, target)` calls:
   - Each connection is a typed edge from `"component.output"` to `"component.input"`.
   - These directly map to CIR edges.

4. **Identify generators as agents.** Each generator component (`OpenAIGenerator`, `OpenAIChatGenerator`, etc.) represents an LLM call point. Map these to CIR agents. Record the model and any bound tools.

5. **Inventory tools.** If using the Agent abstraction, find tools passed to `Agent(tools=...)`. For pipeline-only code, tools may appear as custom components.

6. **Map prompt templates.** Find `PromptBuilder(template=...)` instances. Record Jinja2 template variables -- these define the data dependencies.

7. **Detect routing logic.** Find `ConditionalRouter` or `FileTypeRouter` components. Map their conditions and output names to CIR branch points.

8. **Map document stores and retrievers.** Find `DocumentStore` instantiations and paired retrievers. Record store type, embedding config, and `top_k`.

9. **Detect architecture pattern.** Classify as RAG pipeline, agent loop, branching pipeline, or composite based on the connection graph.

10. **Emit CIR.** Combine all extracted components:
    - `agents[]` -- one per generator or Agent component
    - `tools[]` -- one per tool definition or tool-like custom component
    - `edges[]` -- one per `pipeline.connect()` call
    - `state{}` -- derived from pipeline input/output contracts and template variables
    - `memory{}` -- document store config and any chat history management
    - `architecture` -- detected pattern label
