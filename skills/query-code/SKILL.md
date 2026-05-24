---
name: query-code
description: Answer questions about a previously analyzed codebase. Reads learn-code output and dispatches an agent that can also Read/Grep the actual source code to provide file:line-grounded answers.
argument-hint: <question> [--repo <path>]
allowed-tools: Read, Write, Bash, Glob, Grep, Skill, Agent
---

# Query-Code — Ask Questions About an Analyzed Codebase

Takes a natural-language question about a codebase, loads the analysis data produced by `learn-code`, and dispatches an agent that answers the question with evidence grounded in actual source files and line numbers.

## Usage

```
/code-learner:query-code "How does authentication work?" --repo /path/to/repo
/code-learner:query-code "What modules depend on the database layer?"
/code-learner:query-code "Where is the HTTP routing configured?" --repo /path/to/my-api
```

## Arguments

- `$1` — The question to answer (required, can be a quoted string)
- `--repo <path>` — Path to the repository (optional if only one analysis exists)

## Execution

### 1. Parse arguments

Extract the question (first positional argument or quoted string) and optional `--repo` path.

If the question is empty, STOP and report: `"Please provide a question about the codebase."`.

### 2. Resolve analysis data

**If `--repo` is provided:**

Resolve to absolute path. Derive `REPO_NAME` from basename. Set:

```bash
GIT_ROOT="$(cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" && pwd)"
BASE_PATH="${GIT_ROOT}/.agent_workspace/${REPO_NAME}"
```

**If `--repo` is NOT provided:**

Scan `.agent_workspace/` for subdirectories containing `synthesis/ONBOARDING.md`.

- If exactly one exists: use it. Derive `REPO_NAME` and `BASE_PATH`.
- If multiple exist: list them and ask the user to specify `--repo`.
- If none exist: report that no analysis data is available.

### 3. Verify analysis exists

Check that `${BASE_PATH}/synthesis/ONBOARDING.md` exists.

**If it does not exist:**

Check if `${BASE_PATH}/workflow/` contains a progress file.

- If a progress file exists with `status: "in_progress"`: report that the analysis is incomplete and offer to resume it.
- If no progress file exists: ask the user if they want to run learn-code first.

If the user agrees to run learn-code:

```
Skill: code-learner:learn-code
args: <repo-path>
```

Wait for it to complete, then proceed to step 4.

### 4. Load analysis context

Read the following files from `${BASE_PATH}/`:

| File | Content |
|------|---------|
| `detection/detection.json` | Language, module map, config info |
| `module-registry/registry.json` | Module purposes and complexity |
| `module-analysis/summary.json` | Detailed per-module analysis |
| `relationships/relationships.json` | Cross-module coupling data |
| `synthesis/ONBOARDING.md` | Full onboarding guide |

If any file is missing (except relationships, which may not exist for older analyses), log a warning but continue with available data.

Assemble the context into a JSON object:

```json
{
  "repo_name": "<REPO_NAME>",
  "primary_language": "<from detection>",
  "detection": "<detection.json contents>",
  "registry": "<registry.json contents>",
  "summaries": "<summary.json contents>",
  "relationships": "<relationships.json contents or []>"
}
```

### 5. Determine repo path

The repo path is needed so the agent can inspect actual source files. Determine it from:

1. The `--repo` argument if provided
2. The `repo_path` field in the progress file at `${BASE_PATH}/workflow/learn-code_${REPO_NAME}.json`
3. The `repo_root` field in `detection.json`

If none of these yield a valid path, warn the user that file:line references may not be available.

### 6. Dispatch code-questioner agent

```
Agent:
  subagent_type: code-learner:code-questioner
  description: "Answer: <question truncated to 60 chars>"
  prompt: |
    Answer this question about the <REPO_NAME> codebase:

    QUESTION: <user's full question>

    ANALYSIS_CONTEXT:
    <JSON context object from step 4>

    ONBOARDING_GUIDE:
    <full contents of ONBOARDING.md>

    REPO_PATH: <absolute path to the repository>

    You may Read and Grep files in REPO_PATH to find specific code evidence.
    Always include file:line references when citing specific code.
```

### 7. Present answer

Display the agent's response directly to the user. No file writing is needed — this is a query-only operation.
