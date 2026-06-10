---
name: translate
description: 'Translate AI agent code from one framework to another, or convert any agent to OpenGAP format. Generates idiomatic target framework code or an OpenGAP file/folder structure from a Canonical Intermediate Representation (CIR). Supports 10 frameworks: LangGraph, CrewAI, OpenAI Agents SDK, AutoGen, Semantic Kernel, Haystack, Agno/Phidata, Google ADK, Lyzr ADK, and OpenGAP. Use when the user wants to convert, port, migrate, rewrite, or translate agent code between any of these frameworks. Triggers on: translate, convert, port, migrate, rewrite, translate to langgraph, convert to crewai, port to openai, migrate to autogen, rewrite in haystack, convert to google adk, convert to lyzr adk, translate to opengap, convert to opengap, make a gitagent, export to opengap, make this a gitagent repo, change framework.'
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, WebSearch, Agent
metadata:
  version: 1.0.0
  category: developer-tools
confidence: 0.96
usage_count: 10
success_count: 9
failure_count: 1
negative_examples:
  - GitHub publish step could not complete — gh CLI not installed and GH_TOKEN/GITHUB_TOKEN not set in environment. All files generated correctly locally.
---

# Translate Agent Code

Generate target framework code from a Canonical Intermediate Representation (CIR).

## Prerequisites

If no CIR exists yet (the user jumped straight to "translate this"), run the **analyze** skill first to produce one. Do not translate without a CIR — it ensures nothing is missed.

## Step 1: Confirm Source and Target

Identify:
- **Source framework**: from the CIR or the user's input
- **Target framework**: ask the user if not specified

Supported targets: LangGraph, CrewAI, OpenAI Agents SDK, AutoGen, Semantic Kernel, Haystack, Agno, Google ADK, Lyzr ADK, **OpenGAP**

> **If the target is OpenGAP**: the output is a **directory of files** (agent.yaml, SOUL.md, skills/, tools/, etc.) — not a Python script. Step 4 generates files, not code. See the OpenGAP-specific rules in Step 5.

> **If the target is Lyzr ADK**, the translation is not finished at code generation. Lyzr ADK is a hosted platform — the agents must actually be *created* in the user's Lyzr workspace by running the generated code. See **Step 7** below; you will need to ask the user for their Lyzr API key.

Confirm: `Translating from **{source}** to **{target}**. Proceed?`

## Step 2: Load Target Reference

Read the corresponding codegen reference for the target framework:
- `references/opengap-codegen.md` ← **use this for OpenGAP target (generates files, not code)**
- `references/langgraph-codegen.md`
- `references/crewai-codegen.md`
- `references/openai-agents-codegen.md`
- `references/autogen-codegen.md`
- `references/semantic-kernel-codegen.md`
- `references/haystack-codegen.md`
- `references/agno-codegen.md`
- `references/google-adk-codegen.md`
- `references/lyzr-adk-codegen.md`

Load **only** the target framework's reference file.

## Step 3: Build Concept Mapping Table

Using `knowledge/concept-mapping.md` and the CIR, create a mapping table for every element:

| # | Source ({source}) | CIR Concept | Target ({target}) | Fidelity |
|---|------------------|-------------|-------------------|----------|
| 1 | `StateGraph` node `process_input` | Agent: Input Processor | `Agent(name="input_processor", instructions=...)` | Direct |
| 2 | `add_conditional_edges` | Conditional Routing | `handoff(target_agent, condition)` | Adapted |
| 3 | `MemorySaver` checkpointer | State Persistence | N/A — manual implementation needed | Lossy |

Fidelity labels:
- **Direct** — clean 1:1 mapping, equivalent semantics
- **Adapted** — concept exists but requires restructuring
- **Lossy** — no direct equivalent, closest approximation used
- **Unsupported** — cannot be translated, will be omitted

Present this table and **pause for user confirmation** before generating code. This is the most important review step — the user should agree with the mapping decisions before code is written.

## Step 4: Generate Target Code

Write complete target framework code following these rules:

### Rule 1: All imports at top
Include every import the code needs. Do not leave any import for the user to guess.

### Rule 2: Idiomatic patterns
Follow the target framework's conventions. The output should look like it was written by an expert in that framework:
- LangGraph: functions as nodes, TypedDict state, explicit edges
- CrewAI: role/goal/backstory agents, task descriptions, crew assembly
- OpenAI Agents SDK: Agent objects with instructions, @function_tool, handoffs
- AutoGen: system_message agents, GroupChat, initiate_chat
- Semantic Kernel: Kernel + plugins, @kernel_function methods
- Haystack: @component classes with run(), Pipeline.connect()
- Agno: Agent(model, instructions, tools), Team for multi-agent
- Google ADK: Agent(name, model, instruction, tools, sub_agents), SequentialAgent/ParallelAgent/LoopAgent for workflows

### Rule 3: Preserve prompts verbatim
System prompts, instructions, role descriptions, backstories — copy them exactly. These are the agent's behavior definition. Do not paraphrase, summarize, or "improve" them.

### Rule 4: Preserve tool implementations
Translate the tool registration mechanism (e.g., `@tool` → `@function_tool`) but keep the function body identical. If the tool calls external services, preserve the exact API calls.

### Rule 5: Mark lossy translations
Add `# TRANSLATION NOTE: {explanation}` comments wherever the translation is not 1:1:

```python
# TRANSLATION NOTE: LangGraph's conditional_edges with multiple targets mapped to
# sequential handoff checks. Original had simultaneous evaluation; this is sequential.
```

### Rule 6: Include entry point
The generated code must include the equivalent of the source's kickoff/run/invoke call so it is immediately runnable.

### Rule 7: Search when uncertain
If you are not confident about a method signature, import path, or API pattern in the target framework, use **WebSearch** before writing the code. Search for:
- `"{method_name}" {framework} documentation`
- `site:docs.{framework_domain} {class_name}`
- `{framework} {concept} example python`

Never guess at APIs — always verify.

## Step 5: Framework-Specific Translation Rules

### Targeting LangGraph
- State must be a `TypedDict` (or use `MessagesState` for chat agents)
- Each agent becomes a node function: `def agent_name(state: State) -> dict:` or `-> Command` (v2.0)
- Tools: bind to model with `.bind_tools()`, use `ToolNode` for execution
- Orchestration: `graph.add_edge()` for sequential, `graph.add_conditional_edges()` for branching, or `Command(goto=)` (v2.0)
- Cycles: LangGraph supports them — use for ReAct loops
- HITL: use `interrupt()` function inside nodes (v2.0) instead of `interrupt_before`/`interrupt_after`
- Caching: `graph.add_node("name", fn, cache_policy=CachePolicy(ttl=N))` for expensive nodes
- Entry: `graph.compile(checkpointer=MemorySaver()).invoke(initial_state)`
- Multi-agent: use sub-graphs via `graph.add_node("subagent", compiled_subgraph)`

### Targeting CrewAI
- Each agent needs `role` (job title), `goal` (objective), `backstory` (context) — synthesize from instructions if source doesn't have them
- Tasks wrap work: `Task(description=..., expected_output=..., agent=agent)`
- Sequential: `Process.sequential` with tasks in order
- Hierarchical: `Process.hierarchical` adds a manager agent
- Flows: use `Flow[State]` with `@start`/`@listen`/`@router` for event-driven orchestration
- Flow persistence: `@persist` for durable state; `@human_feedback` for HITL
- Flow memory: `self.remember()`/`self.recall()` for cross-step memory
- Tools: `@tool` decorator or pass tool functions/objects to Agent
- Config: optionally generate `agents.yaml` + `tasks.yaml` for YAML-based setup
- Entry: `crew.kickoff(inputs={...})` or `flow.kickoff()`

### Targeting OpenAI Agents SDK
- Agents: `Agent(name=..., instructions=..., tools=[...], handoffs=[...])`
- Tools: `@function_tool` decorated functions with type-annotated parameters
- Multi-agent: `handoff(agent)` in agent's handoffs list
- Guardrails: `InputGuardrail(guardrail_function)` / `OutputGuardrail(...)` if source had validation
- Structured output: `output_type=PydanticModel` if source had typed output
- Entry: `result = Runner.run(agent, input="...")`
- Note: OpenAI models only — add a comment if source used non-OpenAI models

### Targeting AutoGen
- Agents: `AssistantAgent(name, system_message, llm_config)` for AI agents
- User proxy: `UserProxyAgent(name, human_input_mode, code_execution_config)` for human/code agents
- Multi-agent: `GroupChat(agents=[...], max_round=N)` + `GroupChatManager(groupchat, llm_config)`
- Tools: `agent.register_function(function_map={...})` or `@register_function`
- Two-agent: `user_proxy.initiate_chat(assistant, message=...)`
- Speaker selection: custom function for conditional routing
- LLM config: `{"model": "gpt-4", "api_key": "..."}` or `config_list`

### Targeting Semantic Kernel
- Create `Kernel()` and add AI service: `kernel.add_service(OpenAIChatCompletion(...))`
- Agents become plugin classes with `@kernel_function` methods
- Register: `kernel.add_plugin(MyPlugin(), plugin_name="...")`
- Invoke: `result = await kernel.invoke(plugin_name="...", function_name="...", arguments=KernelArguments(...))`
- Multi-agent: Use SK Agent Framework if available, otherwise manual orchestration
- Memory: `TextMemoryPlugin` for semantic memory

### Targeting Haystack
- Each processing step becomes a `@component` class with `run()` method
- Must declare `@component.output_types(output_name=Type)`
- Pipeline: `pipeline = Pipeline()`, `pipeline.add_component("name", ComponentClass())`
- Connect: `pipeline.connect("comp1.output", "comp2.input")`
- No cycles — Haystack pipelines are DAGs. If source has loops, unroll or add a comment
- Routing: `ConditionalRouter` for branching logic
- Entry: `result = pipeline.run({"component_name": {"input_name": value}})`

### Targeting Agno
- Agent: `Agent(model=OpenAIChat(id="gpt-4o"), instructions=[...], tools=[...], storage=SqliteStorage(...))`
- Tools: pass functions directly or use Toolkit classes
- Multi-agent: `Team(agents=[...], mode="coordinate")` or `Workflow` with steps
- Memory: `Memory(db=SqliteMemoryDb())` for persistent memory
- Knowledge: `knowledge_base=PDFKnowledgeBase(...)` for RAG
- Entry: `agent.run(message)` or `agent.print_response(message)`

### Targeting Google ADK
- Agent: `Agent(name="...", model="gemini-2.5-flash", instruction="...", tools=[...], sub_agents=[...])`
- Tools: plain functions with docstrings (auto-wrapped by ADK), or `BaseTool` subclass, or `AgentTool(agent=...)` to wrap an agent as a tool
- Multi-agent: `sub_agents=[...]` parameter; the LLM decides which sub_agent to invoke based on `description`
- Workflow: `SequentialAgent`, `ParallelAgent`, `LoopAgent` for deterministic control flow without LLM
- State: session key-value store; use `{var}` interpolation in `instruction` strings; `output_key=` for sequential data flow
- Memory: `InMemoryMemoryService()` for cross-session searchable recall
- Entry: `Runner(agent=agent, app_name="app", session_service=InMemorySessionService()).run_async(session_id, user_id, message)`
- Note: Default models are Gemini; add `# TRANSLATION NOTE:` if source used non-Google models (use `LiteLlm` wrapper)

### Targeting OpenGAP
- Output is a **directory of files**, not a Python script — use Write tool to create each file
- Directory name: kebab-case version of the agent's name (e.g. `research-writer-agent/`)
- Always generate at minimum: `agent.yaml` + `SOUL.md`
- **Skills vs Agents — the critical distinction (apply to every source framework):**
  - Use `skills/<name>/SKILL.md` for capabilities/behaviors the main agent has (LangGraph node function, CrewAI Task, OpenAI function tool)
  - Use `agents/<name>/` sub-folders for **any discrete entity with its own identity, role, and purpose** — this applies to ALL frameworks:
    - CrewAI: `Agent(role=, goal=, backstory=)` → `agents/<name>/`
    - LangGraph: sub-graph → `agents/<name>/`
    - OpenAI Agents SDK: agent used via `handoff` → `agents/<name>/`
    - AutoGen: each `GroupChat` agent → `agents/<name>/`
    - Google ADK: each entry in `sub_agents=[]` → `agents/<name>/`
    - Agno: each `Team` member → `agents/<name>/`
  - **Never flatten multi-agent source code into skills.** If the source has N agents, there must be N `agents/<name>/` folders.
  - Each sub-agent folder must contain at minimum `agent.yaml` + `SOUL.md`. Do NOT create an `AGENTS.md` file — that is not part of the OpenGAP spec.
- For ordered multi-agent flows (fan-out/fan-in, sequential pipelines, conditional branching), also generate `workflows/<name>.yaml` — follow the exact format in `references/opengap-codegen.md` §11: `id` + `action` required on every step, no `parallel:` keyword (parallelism is implicit via `depends_on`), no `name:` on steps, `inputs` is a key-value object, `outputs` is an array of strings, template syntax is `${{ }}`
- The orchestrator `agent.yaml` must include an `agents:` block listing all sub-agents with their descriptions, and a `delegation:` block
- Map source tool functions → `tools/<name>.yaml` + `tools/<name>.py` (interface + implementation)
- Map source system prompts / instructions / backstories → SOUL.md body (verbatim)
- Map source guardrails / constraints → `RULES.md`
- Map source RAG / document stores → `knowledge/` directory with `index.yaml`
- Map source persistent memory → `memory/MEMORY.md`
- Map source lifecycle hooks / middleware → `hooks/hooks.yaml`
- Model IDs: use the mapping table in `references/opengap-codegen.md` to convert framework model IDs to OpenGAP format
- After generating all files, list the complete output tree for the user
- Suggest: `opengap validate` or `gitagent --dir ./<agent-name>` to run the generated agent

### Targeting Lyzr ADK
- One `Studio()` instance; one `studio.create_agent(name, provider, role, goal, instructions, ...)` per CIR agent
- `Studio()` reads the API key from the `LYZR_API_KEY` env var (or `Studio(api_key=...)`) — **never hardcode the key into the generated file**
- Tools: plain Python functions added with `agent.add_tool(fn)` (the docstring becomes the description; no decorator needed — an optional `@tool` from `from lyzr import tool` also works)
- RAG: `knowledge_bases=[...]`; memory: pass `session_id=` to `agent.run(...)`; structured output: `response_model=PydanticModel`
- `studio.create_agent(...)` performs a real `POST /v3/agents/` — running the code **creates a live agent**. The returned object's `.id` is the live agent id.
- Entry / read replies: `response = agent.run("..."); print(response.response)`
- The generated script must `print(...)` each created agent's `name` and `.id` so the user can locate them in Lyzr Studio
- See **Step 7** — after generating the code you must ask for the API key and actually run it to create the agents

## Step 6: Output

Write generated code to file(s):
- Single framework: `{agent_name}_{target}.py`
- CrewAI with YAML: also generate `agents.yaml` and `tasks.yaml`
- Semantic Kernel: may need plugin files

Present:
1. The generated code with syntax highlighting
2. A summary of translation decisions
3. A list of all `# TRANSLATION NOTE:` items (lossy/adapted mappings)
4. Required pip packages: `pip install {packages}`
5. Required environment variables
6. Suggested next step: `Run the **validate** skill to verify the translation`

## Step 7: Create the agents live (Lyzr ADK target ONLY)

Run this step **only when the target framework is Lyzr ADK.** For every other target, stop after Step 6 — do not run anything. Lyzr ADK is a hosted platform, so a translation to Lyzr ADK is only complete once the agents have actually been created in the user's Lyzr workspace. Follow `references/lyzr-adk-codegen.md` §10.

1. **Ask for the Lyzr API key — always, every time.** Do not create anything without it:
   > "To actually create these agents in your Lyzr workspace I need your **Lyzr API key** (from https://studio.lyzr.ai → Settings → API Keys). Paste it here, or say **skip** to keep the generated code only."
   If the user says skip, stop here and deliver the code as-is.

2. **Never hardcode or echo the key.** Export it as an environment variable for this run only — `Studio()` reads `LYZR_API_KEY` automatically. Do not write the key into the `.py` file, do not print it, do not commit it:
   ```bash
   export LYZR_API_KEY="<the key the user gave>"
   # lyzr-adk is PRE-INSTALLED in the sandbox's system Python — do NOT reinstall it.
   # Only install if the import is somehow missing:
   python3 -c "import lyzr" 2>/dev/null || pip install --user -q lyzr-adk
   python3 <generated_script>.py
   ```

3. **The script must print each created agent's name + id.** `studio.create_agent(...)` does a real `POST /v3/agents/` and returns an `Agent` whose `.id` is the live id:
   ```python
   import os
   from lyzr import Studio

   studio = Studio()  # reads LYZR_API_KEY from env — do NOT pass the key literal
   agent = studio.create_agent(
       name="...", provider="openai/gpt-4o",
       role="...", goal="...", instructions="...",
   )
   # agent.add_tool(my_tool)   # for each CIR tool
   print(f"✅ Created: {agent.name}  id={agent.id}")
   ```

4. **Run it and report.** Execute the script with Bash, capture the printed agent IDs, and tell the user the agents are now live in their Lyzr Studio workspace (https://studio.lyzr.ai), listing each `name` → `id`. On failure, surface the exact error and ask the user to fix it:
   - `AuthenticationError` → the key is missing/invalid/expired — ask for a fresh one
   - `APIError` / `ValidationError` → bad `provider`/model id, quota, or a malformed field — show the message and the offending value

## Step 8: Publish the translated code to a NEW GitHub repo

After the code is generated (and, for a Lyzr ADK target, after Step 7), publish the translation to a **fresh GitHub repo** so the user gets a shareable result. A GitHub token is in the environment (`GH_TOKEN` / `GITHUB_TOKEN`); `gh` and `git` are installed and `gh` reads `GH_TOKEN` automatically. Do this by default; report the URL at the end.

1. **Assemble the output in a clean directory** (NOT the cloned source repo — start empty so the new repo contains only the translation): the generated file(s) + a short `README.md` stating *source framework → target framework*, the original source URL, the `pip install …` line, and how to run.
2. **Name the repo** `<source-repo-name>-<target-framework>`, lowercased with every non-alphanumeric run collapsed to `-` (e.g. source `write_a_book_with_flows` + target Lyzr ADK ⇒ `write-a-book-with-flows-lyzr-adk`). If the name already exists, append `-2`, `-3`, …
3. **Create + push** under the token's account (do NOT print the token):
   ```bash
   cd <output-dir>
   git init -q
   git add -A
   git -c user.email="agent@lyzr.ai" -c user.name="Framework Translator" commit -q -m "Translate <source> → <target>"
   gh repo create <name> --public --source . --remote origin --push
   ```
   If `gh repo create --push` fails, create the repo first (`gh repo create <name> --public`) then `git push -u origin HEAD:main`.
4. **Report the repo URL** to the user — `https://github.com/<owner>/<name>` (get `<owner>` from `gh api user -q .login`). Never echo the token. If repo creation fails (bad/again-rate-limited token), surface the `gh` error and tell the user the code is ready locally but the push failed.
