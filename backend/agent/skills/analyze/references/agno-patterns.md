# Agno (formerly Phidata) Framework Patterns Reference

Use this reference to identify, decompose, and extract CIR from Agno/Phidata agent code.

---

## 1. Import Fingerprints

Presence of any of these imports confirms an Agno codebase:

```python
# Core agent
from agno.agent import Agent

# Models
from agno.models.openai import OpenAIChat
from agno.models.anthropic import Claude
from agno.models.groq import Groq
from agno.models.ollama import Ollama
from agno.models.google import Gemini

# Tools
from agno.tools.duckduckgo import DuckDuckGoTools
from agno.tools.file import FileTools
from agno.tools.shell import ShellTools
from agno.tools.python import PythonTools
from agno.tools.website import WebsiteTools

# Teams
from agno.team import Team

# Workflows
from agno.workflow import Workflow, RunResponse

# Storage and memory
from agno.storage.sqlite import SqliteStorage
from agno.storage.postgres import PostgresStorage
from agno.memory import Memory
from agno.memory.db.postgres import PgMemoryDb

# Knowledge
from agno.knowledge.pdf import PDFKnowledgeBase
from agno.knowledge.website import WebsiteKnowledgeBase
from agno.knowledge.combined import CombinedKnowledgeBase
from agno.vectordb.pgvector import PgVector
```

### Legacy Phidata imports (pre-rebrand)

```python
from phi.agent import Agent
from phi.model.openai import OpenAIChat
from phi.model.anthropic import Claude
from phi.tools.duckduckgo import DuckDuckGoTools
from phi.storage.agent.sqlite import SqlAgentStorage
from phi.knowledge.pdf import PDFKnowledgeBase
from phi.workflow import Workflow
```

Secondary signals: `Agent(model=..., tools=[...])`, `team.run()`, `RunResponse`.

---

## 2. Agent Patterns

The `Agent` is the primary abstraction. It wraps a model with instructions, tools, and context.

```python
agent = Agent(
    name="Research Assistant",
    model=OpenAIChat(id="gpt-4o"),
    instructions=[
        "You are a research assistant.",
        "Always cite your sources.",
    ],
    tools=[DuckDuckGoTools(), FileTools()],
    storage=SqliteStorage(table_name="agent_sessions", db_file="agents.db"),
    memory=Memory(db=PgMemoryDb(table_name="agent_memory", db_url=db_url)),
    knowledge=knowledge_base,
    show_tool_calls=True,
    markdown=True,
    debug_mode=False,
)

# Run the agent
response = agent.run("Find recent papers on transformer architectures")
# Or print the response directly
agent.print_response("What is the capital of France?")
```

### Agent parameters
| Parameter | Purpose |
|---|---|
| `name` | Agent identifier |
| `model` | LLM to use (required) |
| `instructions` | System prompt as string or list of strings |
| `tools` | List of tool instances or plain functions |
| `storage` | Session persistence backend |
| `memory` | Long-term memory with DB backend |
| `knowledge` | Knowledge base for RAG |
| `show_tool_calls` | Display tool usage in output |
| `markdown` | Format output as markdown |
| `structured_output` | Pydantic model for typed responses |
| `reasoning` | Enable extended thinking/reasoning |

### Identification rules
- Look for `Agent(...)` constructor with `model=` parameter.
- `instructions=` defines the system prompt.
- Tools, storage, memory, and knowledge are all optional add-ons.

---

## 3. Model Patterns

Models are thin wrappers around LLM provider APIs.

```python
from agno.models.openai import OpenAIChat
from agno.models.anthropic import Claude
from agno.models.groq import Groq
from agno.models.ollama import Ollama
from agno.models.google import Gemini

# OpenAI
model = OpenAIChat(id="gpt-4o")
model = OpenAIChat(id="gpt-4o-mini", temperature=0.7, max_tokens=4096)

# Anthropic
model = Claude(id="claude-sonnet-4-5-20250514")

# Groq (fast inference)
model = Groq(id="llama-3.3-70b-versatile")

# Local via Ollama
model = Ollama(id="llama3.2")

# Google
model = Gemini(id="gemini-2.0-flash")
```

### Identification
- `from agno.models.<provider>` -- each provider has its own module.
- `id=` specifies the model identifier string.
- Additional params: `temperature`, `max_tokens`, `api_key`, `base_url`.

---

## 4. Tool Patterns

### Built-in toolkit classes

```python
from agno.tools.duckduckgo import DuckDuckGoTools
from agno.tools.file import FileTools
from agno.tools.shell import ShellTools
from agno.tools.python import PythonTools
from agno.tools.website import WebsiteTools
from agno.tools.arxiv import ArxivTools
from agno.tools.newspaper import NewspaperTools
from agno.tools.sql import SQLTools
from agno.tools.email import EmailTools
from agno.tools.slack import SlackTools

agent = Agent(tools=[DuckDuckGoTools(), PythonTools()])
```

### Plain functions as tools

```python
def get_weather(city: str) -> str:
    """Get the current weather for a city.

    Args:
        city: The city name to look up weather for.
    """
    return f"Weather in {city}: 72F, sunny"

agent = Agent(
    model=OpenAIChat(id="gpt-4o"),
    tools=[get_weather],
)
```

### Identification
- Toolkit classes: imported from `agno.tools.*`, instantiated and passed in `tools=[]`.
- Function tools: plain Python functions with docstrings; the docstring provides the tool description.
- Tool parameters are inferred from function signatures and type annotations.

---

## 5. Team Patterns

Teams orchestrate multiple agents working together.

```python
from agno.team import Team

researcher = Agent(
    name="Researcher",
    model=OpenAIChat(id="gpt-4o"),
    instructions=["You research topics thoroughly."],
    tools=[DuckDuckGoTools()],
)

writer = Agent(
    name="Writer",
    model=OpenAIChat(id="gpt-4o"),
    instructions=["You write clear, engaging content."],
)

editor = Agent(
    name="Editor",
    model=Claude(id="claude-sonnet-4-5-20250514"),
    instructions=["You review and improve writing."],
)

team = Team(
    agents=[researcher, writer, editor],
    mode="coordinate",           # or "route" or "collaborate"
    instructions=["Produce a well-researched article."],
    show_tool_calls=True,
    markdown=True,
)

response = team.run("Write an article about quantum computing")
team.print_response("Write an article about quantum computing")
```

### Team modes
| Mode | Behavior |
|---|---|
| `"coordinate"` | A coordinator agent delegates tasks to team members in sequence |
| `"route"` | Routes the request to the best-suited agent |
| `"collaborate"` | All agents contribute and results are combined |

### Identification
- `Team(agents=[...], mode=...)` -- multi-agent orchestration.
- Each agent in the team is a full `Agent` instance with its own model and tools.
- The `mode` parameter determines orchestration strategy.

---

## 6. Workflow Patterns

Workflows define multi-step processes with explicit control flow.

```python
from agno.workflow import Workflow, RunResponse
from pydantic import BaseModel

class BlogPostWorkflow(Workflow):
    researcher: Agent = Agent(
        model=OpenAIChat(id="gpt-4o"),
        tools=[DuckDuckGoTools()],
        instructions=["Research the given topic."],
    )

    writer: Agent = Agent(
        model=OpenAIChat(id="gpt-4o"),
        instructions=["Write a blog post based on the research."],
    )

    def run(self, topic: str) -> RunResponse:
        # Step 1: Research
        research = self.researcher.run(f"Research: {topic}")

        # Step 2: Write using research
        article = self.writer.run(
            f"Write a blog post about {topic}. Use this research:\n{research.content}"
        )

        return RunResponse(content=article.content)

workflow = BlogPostWorkflow()
response = workflow.run("AI agents in 2026")
```

### Identification
- Subclass of `Workflow` with a `run()` method.
- Agents defined as class attributes.
- `RunResponse` is the return type.
- Control flow is explicit Python (if/else, loops, etc.).

---

## 7. Storage and Memory

### Session storage (conversation persistence)

```python
from agno.storage.sqlite import SqliteStorage
from agno.storage.postgres import PostgresStorage

# SQLite
storage = SqliteStorage(table_name="agent_sessions", db_file="agents.db")

# PostgreSQL
storage = PostgresStorage(table_name="agent_sessions", db_url="postgresql://...")

agent = Agent(storage=storage)
```

### Long-term memory

```python
from agno.memory import Memory
from agno.memory.db.postgres import PgMemoryDb

memory = Memory(
    db=PgMemoryDb(table_name="agent_memory", db_url="postgresql://..."),
)

agent = Agent(
    memory=memory,
    enable_memory=True,
)
```

### Identification
- `storage=` persists session/conversation history across runs.
- `memory=` with `enable_memory=True` provides long-term recall across sessions.
- Storage and memory are separate concerns: storage is per-session, memory is cross-session.

---

## 8. Knowledge Patterns

Knowledge bases give agents access to domain-specific information via RAG.

```python
from agno.knowledge.pdf import PDFKnowledgeBase
from agno.knowledge.website import WebsiteKnowledgeBase
from agno.knowledge.combined import CombinedKnowledgeBase
from agno.vectordb.pgvector import PgVector

# PDF knowledge
pdf_kb = PDFKnowledgeBase(
    path="data/docs",
    vector_db=PgVector(table_name="pdf_docs", db_url="postgresql://..."),
)

# Website knowledge
web_kb = WebsiteKnowledgeBase(
    urls=["https://docs.example.com"],
    vector_db=PgVector(table_name="web_docs", db_url="postgresql://..."),
)

# Combined
combined_kb = CombinedKnowledgeBase(
    sources=[pdf_kb, web_kb],
)

# Load knowledge (run once or on update)
combined_kb.load()

agent = Agent(
    model=OpenAIChat(id="gpt-4o"),
    knowledge=combined_kb,
    search_knowledge=True,
)
```

### Identification
- `*KnowledgeBase` classes from `agno.knowledge.*`.
- Always paired with a `vector_db` (PgVector, ChromaDb, etc.).
- `knowledge=` on the Agent enables RAG retrieval.
- `search_knowledge=True` enables automatic knowledge searching.

---

## 9. Decomposition Guide -- Extracting CIR from Agno/Phidata

Follow these steps to produce a Common Intermediate Representation:

1. **Detect framework version.** Check imports: `agno.*` is current, `phi.*` is legacy Phidata. The API shape is nearly identical; module paths differ.

2. **Inventory agents.** Search for all `Agent(...)` instantiations. For each agent:
   - Record the name, model, and instructions.
   - List all tools (toolkit classes and function tools).
   - Note storage, memory, and knowledge bindings.
   - Each Agent maps to a CIR agent.

3. **Inventory tools.** Collect all tool references from `tools=[...]` across all agents:
   - Toolkit classes: record the class name and its capabilities.
   - Function tools: record the function name, docstring, and parameter types.
   - Each tool maps to a CIR tool.

4. **Identify orchestration.** Determine the top-level pattern:
   - **Single Agent**: one `Agent` with `agent.run()` -- simplest CIR.
   - **Team**: `Team(agents=[...], mode=...)` -- map mode to CIR orchestration type.
   - **Workflow**: `Workflow` subclass with explicit `run()` method -- map steps to CIR edges.

5. **Map team structure.** If a `Team` is used:
   - Record all member agents and their roles.
   - Record the `mode` (coordinate/route/collaborate).
   - Map to CIR multi-agent pattern with appropriate edge types.

6. **Map workflow steps.** If a `Workflow` is used:
   - Trace the `run()` method to identify the sequence of agent calls.
   - Each agent call is a CIR node; data passed between calls defines CIR edges.
   - Conditional logic maps to CIR branch points.

7. **Map storage and memory.** Record:
   - Storage type and table name (session persistence).
   - Memory DB type and configuration (long-term recall).
   - Knowledge base sources and vector DB config (RAG).

8. **Detect architecture pattern.** Classify as single-agent, team-based (with mode), workflow-based, or hybrid.

9. **Emit CIR.** Combine all extracted components:
   - `agents[]` -- one per `Agent` instance
   - `tools[]` -- one per tool (toolkit or function)
   - `edges[]` -- derived from Team mode, Workflow sequence, or single-agent loop
   - `state{}` -- instructions, model config, structured output schemas
   - `memory{}` -- storage type, memory DB, knowledge base config
   - `architecture` -- detected pattern label
