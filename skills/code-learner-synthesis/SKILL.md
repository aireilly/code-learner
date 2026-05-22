---
name: code-learner-synthesis
description: Combine all module summaries and relationship data to produce the final ONBOARDING.md onboarding guide.
argument-hint: <repo-path> --base-path <path>
allowed-tools: Read, Write, Bash, Agent
---

# Synthesis Step

Step skill for the code-learner pipeline. Follows the step skill contract: **parse args → run context builder → dispatch agent → verify output → write sidecar**.

Assembles all module summaries and relationship data into a single context, then dispatches one `synthesis-writer` agent to produce the final ONBOARDING.md.

## Arguments

- `$1` — Path to the repository root (required)
- `--base-path <path>` — Base output path (e.g., `.agent_workspace/my-repo`)

## Output

```
<base-path>/synthesis/ONBOARDING.md
<base-path>/synthesis/dependency-graph.json    (if relationships exist)
<base-path>/synthesis/step-result.json
```

## Execution

### 1. Parse arguments

Extract the repo path and `--base-path` from the args string.

Set paths:

```bash
OUTPUT_DIR="${BASE_PATH}/synthesis"
mkdir -p "$OUTPUT_DIR"
```

### 2. Build synthesis context

Run the context builder script:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/build_synthesis_context.py --base-path "${BASE_PATH}"
```

Capture the JSON output. If it contains an `error` field, STOP and report the error.

The script returns:
- `repo_name`
- `primary_language`
- `module_count`
- `relationship_count` (0 if relationships step was skipped)
- `summaries` (array of module analysis results)
- `relationships` (array of relationship results, empty if skipped)
- `context_size_bytes`

### 3. Dispatch synthesis-writer agent

Use the Agent tool to dispatch ONE `synthesis-writer` agent:

```
Agent:
  subagent_type: code-learner:synthesis-writer
  description: "Write onboarding guide for <repo-name>"
  prompt: |
    Write an engineer onboarding guide for this codebase.

    CONTEXT:
    <JSON output from build_synthesis_context.py>

    OUTPUT_DIR: <OUTPUT_DIR>

    Write ONBOARDING.md to the output directory.
    If relationships data exists (relationship_count > 0), also write dependency-graph.json.

    Follow the template from ${CLAUDE_PLUGIN_ROOT}/reference/onboarding-template.md.
```

### 4. Verify output

Confirm `${OUTPUT_DIR}/ONBOARDING.md` exists. If it does not, STOP and report the synthesis agent failed.

### 5. Write step-result.json

Determine which sections are present in ONBOARDING.md by scanning for level-2 headings (`## `):

```json
{
  "schema_version": 1,
  "step": "synthesis",
  "target": "<repo-name>",
  "completed_at": "<current ISO 8601 UTC timestamp>",
  "output_file": "ONBOARDING.md",
  "sections": ["<list of section names from ## headings>"],
  "context_size_bytes": "<from context builder>"
}
```

Write to `${OUTPUT_DIR}/step-result.json`.

### 6. Verify

Confirm both `ONBOARDING.md` and `step-result.json` exist. Log: `"Synthesis complete: ONBOARDING.md written to ${OUTPUT_DIR}"`.
