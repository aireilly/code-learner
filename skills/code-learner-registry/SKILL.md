---
name: code-learner-registry
description: Dispatch the repo-mapper agent to produce a per-module registry with tailored questions for each module analysis agent.
argument-hint: <repo-path> --base-path <path>
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
---

# Module Registry Step

Step skill for the code-learner pipeline. Follows the step skill contract: **parse args → read upstream → dispatch agent → write output**.

Reads detection data, dispatches one `repo-mapper` agent to analyze config files and module structure, and produces a module registry with tailored analysis questions.

## Arguments

- `$1` — Path to the repository root (required)
- `--base-path <path>` — Base output path (e.g., `.agent_workspace/my-repo`)

## Output

```
<base-path>/module-registry/registry.json
<base-path>/module-registry/registry.md
<base-path>/module-registry/step-result.json
```

## Execution

### 1. Parse arguments

Extract the repo path and `--base-path` from the args string.

Set paths:

```bash
INPUT_FILE="${BASE_PATH}/detection/detection.json"
OUTPUT_DIR="${BASE_PATH}/module-registry"
mkdir -p "$OUTPUT_DIR"
```

### 2. Read detection data

Read `${INPUT_FILE}`. If it does not exist, STOP and report that the detection step must complete first.

Extract:
- `primary_language`
- `modules` (the module map)
- `config_contents` (config file text)
- `module_count`

If `module_count` is 0, write an empty registry and step-result, then exit.

### 3. Dispatch repo-mapper agent

Use the Agent tool to dispatch ONE `repo-mapper` agent:

```
Agent:
  subagent_type: code-learner:repo-mapper
  description: "Map modules for <repo-name>"
  prompt: |
    Analyze this <PRIMARY_LANGUAGE> repository and produce a module registry.

    DETECTION_DATA:
    <JSON of detection data — include modules, module_count, config_files>

    CONFIG_CONTENTS:
    <Text of each config file, prefixed with filename headers>

    REPO_PATH: <repo-path>

    Produce a JSON array of module entries, one per module in the detection data.
    Print ONLY the JSON array to stdout.
```

### 4. Parse agent response

The agent should return a JSON array. Parse it into `registry.json`.

If the agent response is not valid JSON:
1. Try to extract a JSON array from the response (look for `[` ... `]`)
2. If that fails, create a fallback registry with minimal entries for each module

### 5. Write registry.json

Write the parsed JSON array to `${OUTPUT_DIR}/registry.json`.

### 6. Write registry.md

Generate a human-readable markdown table:

```markdown
# Module Registry — <repo-name>

| Module | Purpose | Complexity | Likely Imports | Analysis Question |
|--------|---------|------------|----------------|-------------------|
| <module> | <purpose> | <complexity> | <imports> | <question truncated to 80 chars> |
```

Write to `${OUTPUT_DIR}/registry.md`.

### 7. Write step-result.json

Count complexity distribution from the registry:

```json
{
  "schema_version": 1,
  "step": "module-registry",
  "target": "<repo-name>",
  "completed_at": "<current ISO 8601 UTC timestamp>",
  "module_count": "<number of modules in registry>",
  "complexity_distribution": {
    "low": "<count>",
    "medium": "<count>",
    "high": "<count>"
  }
}
```

Write to `${OUTPUT_DIR}/step-result.json`.

### 8. Verify

Confirm all three output files exist. Log: `"Registry complete: <module_count> modules (low: N, medium: N, high: N)"`.
