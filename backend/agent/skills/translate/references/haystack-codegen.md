# Haystack 2.x Code Generation Reference

> Target version: haystack-ai >= 2.0 (2025-2026 API)

---

## 1. Required Imports

```python
# Core
from haystack import Pipeline, Document
from haystack.components.generators import OpenAIGenerator
from haystack.components.generators.chat import OpenAIChatGenerator
from haystack.components.builders import PromptBuilder, ChatPromptBuilder
from haystack.components.retrievers.in_memory import InMemoryBM25Retriever, InMemoryEmbeddingRetriever
from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack.components.embedders import (
    SentenceTransformersTextEmbedder,
    SentenceTransformersDocumentEmbedder,
)
from haystack.components.routers import ConditionalRouter, FileTypeRouter
from haystack.components.writers import DocumentWriter
from haystack.dataclasses import ChatMessage

# Anthropic (haystack-ai[anthropic] or haystack-integrations)
from haystack_integrations.components.generators.anthropic import AnthropicGenerator, AnthropicChatGenerator
```

---

## 2. Custom Component Template

```python
from haystack import component

@component
class TextCleaner:
    """Strips whitespace and lowercases text."""

    @component.output_types(cleaned_text=str)
    def run(self, text: str) -> dict:
        return {"cleaned_text": text.strip().lower()}
```

### Component with List I/O

```python
from typing import List

@component
class DocumentMerger:
    """Merges multiple documents into one."""

    @component.output_types(merged=Document)
    def run(self, documents: List[Document]) -> dict:
        content = "\n\n".join(d.content for d in documents)
        return {"merged": Document(content=content)}
```

---

## 3. Generator Templates

### OpenAIGenerator (text-in, text-out)

```python
generator = OpenAIGenerator(model="gpt-4o", api_key=Secret.from_env_var("OPENAI_API_KEY"))
result = generator.run(prompt="Explain quantum computing in one sentence.")
print(result["replies"][0])
```

### OpenAIChatGenerator (chat messages)

```python
messages = [
    ChatMessage.from_system("You are a helpful assistant."),
    ChatMessage.from_user("What is Haystack?"),
]
chat_gen = OpenAIChatGenerator(model="gpt-4o")
result = chat_gen.run(messages=messages)
print(result["replies"][0].text)
```

### AnthropicGenerator

```python
generator = AnthropicGenerator(model="claude-sonnet-4-20250514")
result = generator.run(prompt="Explain RAG in one paragraph.")
print(result["replies"][0])
```

---

## 4. PromptBuilder Template

```python
template = """
Given the following documents, answer the question.

Documents:
{% for doc in documents %}
  - {{ doc.content }}
{% endfor %}

Question: {{ question }}
Answer:
"""

prompt_builder = PromptBuilder(template=template)

# At runtime, pass variables matching the Jinja2 placeholders:
result = prompt_builder.run(
    documents=[Document(content="Haystack is an LLM framework.")],
    question="What is Haystack?",
)
print(result["prompt"])
```

---

## 5. Retriever + DocumentStore Template

### BM25 Retriever (keyword-based)

```python
doc_store = InMemoryDocumentStore()
doc_store.write_documents([
    Document(content="Haystack is an open-source LLM framework."),
    Document(content="Python is a programming language."),
])

retriever = InMemoryBM25Retriever(document_store=doc_store)
results = retriever.run(query="What is Haystack?", top_k=3)
```

### Embedding Retriever (semantic)

```python
doc_store = InMemoryDocumentStore()

doc_embedder = SentenceTransformersDocumentEmbedder(model="sentence-transformers/all-MiniLM-L6-v2")
doc_embedder.warm_up()
docs_with_embeddings = doc_embedder.run(documents=[
    Document(content="Haystack builds LLM pipelines."),
])
doc_store.write_documents(docs_with_embeddings["documents"])

text_embedder = SentenceTransformersTextEmbedder(model="sentence-transformers/all-MiniLM-L6-v2")
retriever = InMemoryEmbeddingRetriever(document_store=doc_store)
```

---

## 6. Pipeline Assembly Template

```python
pipe = Pipeline()

pipe.add_component("retriever", InMemoryBM25Retriever(document_store=doc_store))
pipe.add_component("prompt", PromptBuilder(template=template))
pipe.add_component("llm", OpenAIGenerator(model="gpt-4o"))

pipe.connect("retriever.documents", "prompt.documents")
pipe.connect("prompt.prompt", "llm.prompt")

result = pipe.run(data={
    "retriever": {"query": "What is Haystack?"},
    "prompt": {"question": "What is Haystack?"},
})
print(result["llm"]["replies"][0])
```

---

## 7. Router Template

### ConditionalRouter

```python
routes = [
    {
        "condition": "{{ query|length > 100 }}",
        "output": "{{ query }}",
        "output_name": "long_query",
        "output_type": str,
    },
    {
        "condition": "{{ query|length <= 100 }}",
        "output": "{{ query }}",
        "output_name": "short_query",
        "output_type": str,
    },
]

router = ConditionalRouter(routes=routes)

pipe = Pipeline()
pipe.add_component("router", router)
pipe.add_component("short_handler", OpenAIGenerator(model="gpt-4o-mini"))
pipe.add_component("long_handler", OpenAIGenerator(model="gpt-4o"))

pipe.connect("router.short_query", "short_handler.prompt")
pipe.connect("router.long_query", "long_handler.prompt")
```

### FileTypeRouter

```python
router = FileTypeRouter(mime_types=["text/plain", "application/pdf"])

pipe = Pipeline()
pipe.add_component("router", router)
# Connect router outputs by MIME type:
# pipe.connect("router.text/plain", "text_converter.sources")
# pipe.connect("router.application/pdf", "pdf_converter.sources")
```

---

## 8. Complete RAG Pipeline Example

```python
from haystack import Pipeline, Document
from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack.components.retrievers.in_memory import InMemoryBM25Retriever
from haystack.components.builders import PromptBuilder
from haystack.components.generators import OpenAIGenerator

# 1. Populate store
store = InMemoryDocumentStore()
store.write_documents([
    Document(content="Haystack is an open-source framework for building LLM applications."),
    Document(content="Haystack pipelines connect components like retrievers, generators, and routers."),
])

# 2. Define prompt
template = """Answer the question based on the context.
Context:
{% for doc in documents %}
- {{ doc.content }}
{% endfor %}

Question: {{ question }}
Answer:"""

# 3. Build pipeline
rag = Pipeline()
rag.add_component("retriever", InMemoryBM25Retriever(document_store=store))
rag.add_component("prompt", PromptBuilder(template=template))
rag.add_component("llm", OpenAIGenerator(model="gpt-4o"))

rag.connect("retriever.documents", "prompt.documents")
rag.connect("prompt.prompt", "llm.prompt")

# 4. Run
result = rag.run(data={
    "retriever": {"query": "What is Haystack?"},
    "prompt": {"question": "What is Haystack?"},
})
print(result["llm"]["replies"][0])
```

---

## 9. Agent Pattern (Tool-Use Loop)

```python
from haystack.components.generators.chat import OpenAIChatGenerator
from haystack.dataclasses import ChatMessage
from haystack.tools import Tool

def search_web(query: str) -> str:
    """Search the web for information."""
    return f"Results for: {query}"

tool = Tool(
    name="search_web",
    description="Search the web for current information.",
    function=search_web,
    parameters={
        "type": "object",
        "properties": {"query": {"type": "string"}},
        "required": ["query"],
    },
)

chat_gen = OpenAIChatGenerator(model="gpt-4o", tools=[tool])
messages = [ChatMessage.from_user("Search for the latest Haystack release.")]
result = chat_gen.run(messages=messages)
```

---

## 10. Common Pitfalls

| Pitfall | Fix |
|---|---|
| Connection type mismatch | Ensure output type of source component matches input type of target; check `@component.output_types` |
| Missing `output_types` decorator | Every custom component needs `@component.output_types(...)` on `run()` |
| Forgetting `warm_up()` | Embedder components require `warm_up()` before standalone use; pipelines call it automatically |
| Wrong `data` keys in `pipe.run()` | Keys must match component names registered via `add_component("name", ...)` |
| Jinja2 variable name mismatch | Template variables must match the keyword arguments passed to `PromptBuilder.run()` |
| Mixing v1 and v2 imports | Never import from `haystack.nodes`; that is Haystack 1.x |
| `Document` without content | `Document(content=None)` will cause downstream errors; always set content |
| Generator vs ChatGenerator | `OpenAIGenerator` takes a `prompt` string; `OpenAIChatGenerator` takes `messages` list |
