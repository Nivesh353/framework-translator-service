---
name: validate
description: "Validate translated agent code for correctness, completeness, and framework API accuracy. Checks imports, method signatures, concept coverage, and idiomatic patterns. Use after translating agent code, when the user says 'validate this translation', 'check if this is correct', 'verify the output', 'does this code work', 'review the translation', or after the translate skill completes. Triggers on: validate, verify, check, review translation, is this correct, does this work, test the output."
allowed-tools: "Read, Bash, Grep, Glob, WebSearch"
metadata:
  version: "1.0.0"
  category: "developer-tools"
---

# Validate Translated Agent Code

Check translated agent code for correctness, completeness, and API accuracy without executing it.

## Step 1: Structural Validation

Read the translated code and perform these checks:

### 1a: Import Verification

For every import statement in the generated code:

1. **Check the module exists** — verify the import path is real for the target framework
2. **Check the class/function exists** — verify the imported name exists in that module
3. **Check for leftover source imports** — no imports from the source framework should remain
4. **Check version compatibility** — the import should work with the current version

If uncertain about any import, use **WebSearch**:
- `"{import_path}" python package`
- `site:pypi.org {package_name}`
- `"{class_name}" {framework} documentation`

Report each import as PASS or FAIL with details.

### 1b: API Correctness

For every method call, constructor, and decorator in the generated code:

1. **Constructor arguments** — verify each argument name and type matches the framework's API
2. **Method signatures** — verify method names exist on the objects they're called on
3. **Decorator usage** — verify decorators are used correctly (e.g., `@function_tool` not `@tool` in OpenAI SDK)
4. **Return types** — verify return values match what the framework expects

If uncertain, use **WebSearch** to check:
- `{framework} {ClassName} constructor arguments`
- `{framework} {method_name} documentation`

Report each API call as PASS or FAIL.

### 1c: Completeness Check

Compare the translated code against the CIR (or source code if no CIR was produced). Check off each item:

- [ ] **All agents/nodes present** — every agent in the source has a counterpart
- [ ] **All tools translated** — every tool definition exists in the target code
- [ ] **All prompts preserved** — diff system prompts/instructions character-by-character against source. Flag any changes.
- [ ] **All orchestration logic present** — every edge, condition, handoff, and routing rule has a counterpart
- [ ] **Entry point present** — the code includes a way to run the agent
- [ ] **State schema translated** — all state fields exist with appropriate types
- [ ] **Memory configuration present** — if source had memory/persistence, target does too
- [ ] **External dependencies preserved** — API calls, database connections, file I/O intact

### 1d: Idiomatic Review

Check whether the code follows target framework conventions:

- Does it use framework-standard patterns? (e.g., TypedDict state for LangGraph, not raw dicts)
- Are there anti-patterns? (e.g., manually managing chat history in AutoGen instead of using GroupChat)
- Would a framework expert recognize this as clean, conventional code?
- Are variable names and structure idiomatic for the target framework?

## Step 2: Lossy Translation Audit

Review every `# TRANSLATION NOTE:` comment in the generated code:

1. **Is the gap real?** — the noted concept may have been added in a newer framework version. Use WebSearch to check.
2. **Is the approximation optimal?** — is there a better way to approximate the missing concept?
3. **Are there alternatives?** — could a different approach achieve closer fidelity?
4. **Is the explanation clear?** — would a developer reading the comment understand what was lost and why?

## Step 3: Dependency Check

List all pip packages required to run the translated code:

```bash
pip install {package1} {package2} ...
```

Verify:
- Package names are correct (e.g., `langgraph` not `lang-graph`)
- Packages are actively maintained and available on PyPI
- Version constraints if the source specified them

List all environment variables required:
```bash
export API_KEY="..."
export OTHER_VAR="..."
```

## Step 4: Validation Report

Output a structured report:

```
## Validation Report

**Source**: {source_framework}
**Target**: {target_framework}
**Status**: PASS / PASS WITH NOTES / FAIL

### Import Verification
| Import | Status | Notes |
|--------|--------|-------|
| `from framework import X` | PASS/FAIL | {details} |

### API Correctness
| Call | Status | Notes |
|------|--------|-------|
| `ClassName(arg1, arg2)` | PASS/FAIL | {details} |

### Completeness
- [x] All agents present
- [x] All tools translated
- [ ] Prompts preserved (ISSUE: line 45 modified "You are..." to "Act as...")
- [x] Orchestration logic present
- [x] Entry point present
- [x] State schema translated

### Idiomatic Review
{assessment with specific suggestions}

### Translation Notes Audit
| # | Note | Assessment |
|---|------|------------|
| 1 | Memory not available | Confirmed — no equivalent in target |
| 2 | Conditional routing adapted | Could use {alternative} instead |

### Dependencies
pip install {packages}

### Environment Variables
{list}

### Overall Assessment
{summary — what works, what needs attention}
```

**Status definitions:**
- **PASS** — all checks pass, code is ready to use
- **PASS WITH NOTES** — code works but has lossy translations or minor style issues the user should know about
- **FAIL** — one or more critical issues (wrong imports, missing agents, broken API calls) that must be fixed

If **FAIL**: list every issue and offer to fix them by re-running the translate skill with corrections.
If **PASS WITH NOTES**: list the caveats so the user can make informed decisions.
If **PASS**: confirm the translation is ready to use and suggest running the code.
