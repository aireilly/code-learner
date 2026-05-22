---
name: code-learner-relationships
description: Cross-module dependency analysis. Fan-out one relationship-analyzer agent per dependency pair. Detects coupling types, shared types, and implicit contracts.
argument-hint: <repo-path> --base-path <path>
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
---

# Relationships Step

Step skill for the code-learner pipeline. Follows the step skill contract: **parse args → read upstream → build pairs → run API extraction → fan out agents → merge → write output**.

Discovers cross-module dependencies from the module analysis summaries, then dispatches one `relationship-analyzer` agent per dependency pair. Uses token-efficient loading: full source for module A, public API surface only for module B.

## Arguments

- `$1` — Path to the repository root (required)
- `--base-path <path>` — Base output path (e.g., `.agent_workspace/my-repo`)

## Output

```
<base-path>/relationships/relationships.json
<base-path>/relationships/dependency-graph.json
<base-path>/relationships/relationships.md
<base-path>/relationships/step-result.json
```

## Execution

### 1. Parse arguments

Extract the repo path and `--base-path` from the args string.

Set paths:

```bash
SUMMARY_FILE="${BASE_PATH}/module-analysis/summary.json"
DETECTION_FILE="${BASE_PATH}/detection/detection.json"
REGISTRY_FILE="${BASE_PATH}/module-registry/registry.json"
OUTPUT_DIR="${BASE_PATH}/relationships"
mkdir -p "$OUTPUT_DIR"
```

### 2. Read upstream data

Read `${SUMMARY_FILE}` (module analysis results), `${DETECTION_FILE}` (for language and file lists), and `${REGISTRY_FILE}` (for module file mapping).

### 3. Build dependency pairs

Run the dependency pair builder:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/build_dep_pairs.py \
  --summaries "${SUMMARY_FILE}" \
  --registry "${REGISTRY_FILE}"
```

Capture JSON output. If `total_pairs` is 0, write empty results and step-result, then exit.

### 4. Prepare source data for each pair

For each pair `(module_a, module_b)`:

**Module A — full source**: Concatenate all source files with `### FILE:` headers (same as module analysis step).

**Module B — API surface only**: Run the appropriate AST extraction script to get just the public API:

**Python:**
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/code-learner-module-analysis/scripts/extract_public_api.py \
  --files <b_files...> --lang python --module <module_b>
```

**JavaScript/TypeScript:**
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/code-learner-module-analysis/scripts/extract_public_api.mjs \
  --files <b_files...> --lang <js|ts> --module <module_b>
```

**Go:**
```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/code-learner-module-analysis/scripts/extract_public_api_go.sh \
  --files <b_files...> --module <module_b>
```

This token optimization loads full source for A but only the API surface for B, cutting token cost by approximately 40%.

### 5. Read language guidance

Read language-specific relationship analysis guidance from `${CLAUDE_PLUGIN_ROOT}/reference/language-configs.md`.

### 6. Fan out relationship-analyzer agents

Dispatch ALL `relationship-analyzer` agents in a **single message** for parallel execution:

```
Agent:
  subagent_type: code-learner:relationship-analyzer
  description: "Analyze relationship: <mod_a> <-> <mod_b>"
  prompt: |
    Analyze the relationship between these two <LANGUAGE> modules.

    MODULE_A: <mod_a>
    MODULE_B: <mod_b>
    LANGUAGE: <primary_language>

    SOURCE_A (full source):
    <concatenated source of module A>

    API_B (public API surface only):
    <JSON output from extract_public_api for module B>

    LANGUAGE_GUIDANCE:
    <relevant section from language-configs.md>

    Print your JSON result to stdout.
```

**Critical**: All Agent tool calls MUST be in a single message for parallel execution.

### 7. Collect and merge results

After all agents complete, collect results. For failed agents, create a fallback:

```json
{
  "pair": ["<module_a>", "<module_b>"],
  "coupling_type": "unknown",
  "description": "Analysis failed — manual review needed",
  "shared_types": [],
  "implicit_assumptions": [],
  "risk": "Unknown",
  "strength": "unknown"
}
```

### 8. Write relationships.json

Write the array of all relationship results to `${OUTPUT_DIR}/relationships.json`.

### 9. Write dependency-graph.json

Build a graph structure from the summaries and relationships:

```json
{
  "nodes": [
    {"id": "<module>", "purpose": "<purpose>", "priority": "<onboarding_priority>"}
  ],
  "edges": [
    {"from": "<module_a>", "to": "<module_b>", "strength": "<tight|loose|none>", "coupling_type": "<type>"}
  ]
}
```

Write to `${OUTPUT_DIR}/dependency-graph.json`.

### 10. Write relationships.md

Generate a human-readable summary:

```markdown
# Cross-Module Relationships — <repo-name>

## Summary

- **Pairs analyzed**: <count>
- **Tight couplings**: <count>
- **Loose couplings**: <count>

## Tight Couplings

### <module_a> ↔ <module_b>

- **Type**: <coupling_type>
- **Description**: <description>
- **Shared types**: <list>
- **Risk**: <risk>

## Loose Couplings

| Pair | Type | Strength |
|------|------|----------|
| <a> ↔ <b> | <type> | loose |
```

Write to `${OUTPUT_DIR}/relationships.md`.

### 11. Write step-result.json

```json
{
  "schema_version": 1,
  "step": "relationships",
  "target": "<repo-name>",
  "completed_at": "<current ISO 8601 UTC timestamp>",
  "pairs_analyzed": "<successful count>",
  "pairs_failed": "<failed count>",
  "coupling_distribution": {
    "tight": "<count>",
    "loose": "<count>",
    "none": "<count>"
  }
}
```

Write to `${OUTPUT_DIR}/step-result.json`.

### 12. Verify

Confirm all output files exist. Log: `"Relationship analysis complete: <pairs_analyzed> pairs (tight: N, loose: N, none: N)"`.
