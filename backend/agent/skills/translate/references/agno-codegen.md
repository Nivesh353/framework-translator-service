# Agno (formerly Phidata) Code Generation Reference

> Target version: agno >= 1.x (2025-2026 API). Package renamed from `phidata` to `agno`.

---

## 1. Required Imports

```python
# Core agent
from agno.agent import Agent

# Models
from agno.models.openai import OpenAIChat
from agno.models.anthropic import Claude
from agno.models.groq import Groq
from agno.models.ollama import Ollama

# Tools
from agno.tools.duckduckgo import DuckDuckGoTools
from agno.tools.file import FileTools
from agno.tools.yfinance import YFinanceTools
from agno.tools.reasoning import ReasoningTools

# Teams
from agno.team import Team

# Workflows
from agno.workflow import Workflow
from agno.run.response import RunResponse, RunEvent

# Storage
from agno.storage.sqlite import SqliteStorage
from agno.storage.postgres import PostgresStorage

# Memory
from agno.memory.db.sqlite import SqliteMemoryDb
from agno.memory import Memory

# Knowledge
from agno.knowledge.pdf import PDFKnowledgeBase
from agno.knowledge.website import WebsiteKnowledgeBase
from agno.vectordb.pgvector import PgVector
```

---

## 2. Agent Template

```python
agent = Agent(
    name="Research Assistant",
    model=OpenAIChat(id="gpt-4o"),
    instructions=[
        "You are a helpful research assistant.",
        "Always cite your sources.",
    ],
    tools=[DuckDuckGoTools()],
    storage=SqliteStorage(
        table_name="agent_sessions",
        db_file="data/agents.db",
    ),
    show_tool_calls=True,
    markdown=True,
)

# Run the agent
agent.print_response("What is the latest news on AI?", stream=True)
```

---

## 3. Model Templates

```python
# OpenAI
model_openai = OpenAIChat(id="gpt-4o")
model_openai_mini = OpenAIChat(id="gpt-4o-mini")

# Anthropic
model_claude = Claude(id="claude-sonnet-4-20250514")

# Groq (fast inference)
model_groq = Groq(id="llama-3.3-70b-versatile")

# Ollama (local)
model_ollama = Ollama(id="llama3.2")
```

---

## 4. Tool Templates

### Function Tool (plain function)

```python
def get_weather(city: str) -> str:
    """Get the current weather for a city."""
    return f"72F and sunny in {city}"

agent = Agent(
    model=OpenAIChat(id="gpt-4o"),
    tools=[get_weather],
)
```

### Toolkit Classes

```python
from agno.tools.duckduckgo import DuckDuckGoTools
from agno.tools.file import FileTools
from agno.tools.yfinance import YFinanceTools
from agno.tools.reasoning import ReasoningTools
from agno.tools.python import PythonTools

agent = Agent(
    model=OpenAIChat(id="gpt-4o"),
    tools=[
        DuckDuckGoTools(),
        FileTools(base_dir="./output"),
        YFinanceTools(stock_price=True, analyst_recommendations=True),
    ],
)
```

---

## 5. Team Template

```python
from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.tools.duckduckgo import DuckDuckGoTools
from agno.tools.yfinance import YFinanceTools
from agno.team import Team

web_agent = Agent(
    name="Web Agent",
    role="Search the web for information",
    model=OpenAIChat(id="gpt-4o"),
    tools=[DuckDuckGoTools()],
    instructions=["Always include sources."],
)

finance_agent = Agent(
    name="Finance Agent",
    role="Get financial data and analysis",
    model=OpenAIChat(id="gpt-4o"),
    tools=[YFinanceTools(stock_price=True, analyst_recommendations=True)],
)

# Coordinate mode: leader orchestrates sequential agent calls
team = Team(
    name="Research Team",
    mode="coordinate",
    model=OpenAIChat(id="gpt-4o"),
    members=[web_agent, finance_agent],
    instructions=["Combine web research with financial data."],
    share_member_interactions=True,
)

team.print_response("Analyze NVDA stock with latest news context.", stream=True)
```

### Team Modes

```python
# Route mode: leader routes to the single best agent
team_router = Team(mode="route", members=[web_agent, finance_agent], model=OpenAIChat(id="gpt-4o"))

# Coordinate mode: leader orchestrates multi-step agent collaboration
team_coord = Team(mode="coordinate", members=[web_agent, finance_agent], model=OpenAIChat(id="gpt-4o"))
```

---

## 6. Workflow Template

```python
from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.workflow import Workflow
from agno.run.response import RunResponse, RunEvent

class ResearchWorkflow(Workflow):
    researcher: Agent = Agent(
        model=OpenAIChat(id="gpt-4o"),
        instructions=["Research the given topic thoroughly."],
    )
    writer: Agent = Agent(
        model=OpenAIChat(id="gpt-4o"),
        instructions=["Write a blog post based on the research."],
    )

    def run(self, topic: str) -> RunResponse:
        # Step 1: Research
        research_response = self.researcher.run(f"Research: {topic}")
        research = research_response.content

        # Step 2: Write
        writer_response = self.writer.run(
            f"Write a blog post using this research:\n{research}"
        )
        return RunResponse(content=writer_response.content, event=RunEvent.workflow_completed)

workflow = ResearchWorkflow()
response = workflow.run(topic="AI agents in 2025")
print(response.content)
```

---

## 7. Storage Template

```python
from agno.storage.sqlite import SqliteStorage
from agno.storage.postgres import PostgresStorage

# SQLite (local development)
sqlite_storage = SqliteStorage(
    table_name="agent_sessions",
    db_file="data/agents.db",
)

# PostgreSQL (production)
pg_storage = PostgresStorage(
    table_name="agent_sessions",
    db_url="postgresql://user:pass@localhost:5432/mydb",
)

agent = Agent(
    model=OpenAIChat(id="gpt-4o"),
    storage=sqlite_storage,
    # Adds a unique session_id for conversation continuity
    session_id="user-123-session",
)
```

---

## 8. Memory Template

```python
from agno.memory import Memory
from agno.memory.db.sqlite import SqliteMemoryDb

memory = Memory(
    db=SqliteMemoryDb(
        table_name="agent_memory",
        db_file="data/memory.db",
    ),
)

agent = Agent(
    model=OpenAIChat(id="gpt-4o"),
    memory=memory,
    enable_agentic_memory=True,  # agent decides what to remember
)
```

---

## 9. Knowledge Template

```python
from agno.knowledge.pdf import PDFKnowledgeBase
from agno.knowledge.website import WebsiteKnowledgeBase
from agno.vectordb.pgvector import PgVector

# PDF knowledge base
pdf_kb = PDFKnowledgeBase(
    path="data/pdfs",
    vector_db=PgVector(
        table_name="pdf_documents",
        db_url="postgresql://user:pass@localhost:5432/mydb",
    ),
)
pdf_kb.load()  # index documents into vector store

# Website knowledge base
web_kb = WebsiteKnowledgeBase(
    urls=["https://docs.agno.com"],
    vector_db=PgVector(
        table_name="web_documents",
        db_url="postgresql://user:pass@localhost:5432/mydb",
    ),
)
web_kb.load()

agent = Agent(
    model=OpenAIChat(id="gpt-4o"),
    knowledge=pdf_kb,
    search_knowledge=True,
)
```

---

## 10. Complete Minimal Example

```python
from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.tools.duckduckgo import DuckDuckGoTools
from agno.storage.sqlite import SqliteStorage

agent = Agent(
    name="Web Assistant",
    model=OpenAIChat(id="gpt-4o"),
    tools=[DuckDuckGoTools()],
    instructions=["You are a helpful web research assistant.", "Always include sources."],
    storage=SqliteStorage(table_name="sessions", db_file="data/agent.db"),
    show_tool_calls=True,
    markdown=True,
)

# Interactive use
agent.print_response("What are the top AI frameworks in 2025?", stream=True)

# Programmatic use
response = agent.run("What are the top AI frameworks in 2025?")
print(response.content)
```

---

## 11. Common Pitfalls

| Pitfall | Fix |
|---|---|
| `from phi.agent import Agent` | Phidata was renamed to Agno; use `from agno.agent import Agent` |
| `from phi.model.openai import OpenAIChat` | Use `from agno.models.openai import OpenAIChat` (note: `models` plural) |
| Wrong model `id` format | Use provider-specific IDs: `"gpt-4o"` for OpenAI, `"claude-sonnet-4-20250514"` for Anthropic |
| Missing API key env var | Set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc. before running |
| Team without `model` | The Team leader needs its own `model` to orchestrate members |
| `Agent.run()` returns `RunResponse` | Access content via `response.content`, not the response object directly |
| Storage without `session_id` | Without `session_id`, each run creates a new session; set it for continuity |
| Knowledge base not loaded | Call `kb.load()` before using the knowledge base with an agent |
| `show_tool_calls` in production | Set `show_tool_calls=False` in production to avoid noisy output |
| Mixing sync/async | Agno provides both `agent.run()` (sync) and `await agent.arun()` (async) |
