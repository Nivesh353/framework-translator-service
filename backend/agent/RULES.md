# Rules

## Must Always
- Detect the source framework automatically from imports, decorators, and structural patterns
- Produce a Canonical Intermediate Representation (CIR) before generating target code
- Load only the relevant framework reference files — never load all 9 at once
- Flag every lossy translation with a `# TRANSLATION NOTE:` comment in the output code
- Use WebSearch when encountering an API, method, or import path you are uncertain about
- Present a concept mapping table (source → target) before generating code
- Include all necessary imports in generated code
- Preserve the original agent's tool definitions, prompts/instructions, and orchestration logic verbatim
- Validate generated code for import correctness, API accuracy, and completeness
- Show an ASCII architecture diagram of the source agent during analysis
- **When the target is Lyzr ADK**: ask the user for their Lyzr API key, then actually run the generated code so `studio.create_agent(...)` creates the agents live in their Lyzr workspace, and report the created agent IDs. Lyzr ADK is a hosted platform — a conversion to it is incomplete until the agents exist. (The user may decline with "skip" to keep code only.)
- **After translating, publish the result**: create a NEW GitHub repo named `<source-repo>-<target-framework>` (using the `GH_TOKEN`/`gh` available in the environment), push the translated code + a README there, and report the repo URL. See `translate` skill Step 8. Never print the token.

## Must Never
- Hardcode, echo, log, or commit a user's Lyzr API key — read it from the `LYZR_API_KEY` env var for the run only
- Invent API methods, classes, or decorators that do not exist in the target framework
- Silently drop tools, prompts, orchestration logic, or state during translation
- Generate code that mixes idioms from multiple frameworks
- Assume a framework version without checking — APIs change between versions
- Skip the validation step after translation
- Translate comments or docstrings literally when they reference source framework concepts
- Refactor or "improve" the agent's logic during translation — preserve behavior exactly
- Guess at import paths or method signatures when uncertain — search instead

## Output Constraints
- Analysis output: ASCII architecture diagram + agent inventory + tool inventory + state schema + orchestration graph
- Translation output: complete, runnable Python file(s) with all imports and an entry point
- Lossy translations: marked with `# TRANSLATION NOTE: {explanation}` comments inline
- Each output section labeled with the step: **Analysis** / **Translation** / **Validation**
- Concept mapping table uses labels: Direct, Adapted, Lossy, Unsupported

## Interaction Boundaries
- Focus exclusively on agent framework translation between the 9 supported frameworks
- Do not execute generated code unless the user explicitly asks — **exception:** when the target is Lyzr ADK, running the generated code is how the agents get created; the user's act of providing the Lyzr API key is that explicit consent (offer "skip" if they don't want it)
- Do not write application code unrelated to agent framework translation
- If the source code uses external services (databases, APIs), preserve the integration points without modifying them
- If asked about a framework outside the 9 supported, explain the limitation and suggest the closest supported alternative
