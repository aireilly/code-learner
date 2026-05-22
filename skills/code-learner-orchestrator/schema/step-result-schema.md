# Step-Result Sidecar Schema

Every workflow step writes a `step-result.json` sidecar alongside its primary output files. The orchestrator reads these sidecars to track progress and display summaries.

## Common fields (all steps)

```json
{
  "schema_version": 1,
  "step": "<step-name>",
  "target": "<repo-name>",
  "completed_at": "<ISO 8601 timestamp>",
  "context_size_bytes": 0
}
```

| Field | Type | Description |
|-------|------|-------------|
| `schema_version` | integer | Always `1` |
| `step` | string | Step name matching the workflow YAML |
| `target` | string | Repository name (basename of repo path) |
| `completed_at` | string | ISO 8601 UTC timestamp |
| `context_size_bytes` | integer | Total bytes of primary output files |

## Per-step extensions

### detection

```json
{
  "primary_language": "python",
  "languages_detected": {"python": 342, "yaml": 15},
  "module_count": 12,
  "total_source_files": 342,
  "config_files_found": ["pyproject.toml", "README.md"]
}
```

### module-registry

```json
{
  "module_count": 12,
  "complexity_distribution": {"low": 4, "medium": 6, "high": 2}
}
```

### module-analysis

```json
{
  "modules_analyzed": 12,
  "modules_failed": 0,
  "total_public_api_entries": 87,
  "languages": ["python"]
}
```

### relationships

```json
{
  "pairs_analyzed": 18,
  "pairs_failed": 0,
  "coupling_distribution": {"tight": 3, "loose": 12, "none": 3}
}
```

### synthesis

```json
{
  "output_file": "ONBOARDING.md",
  "sections": ["architecture_overview", "module_map", "reading_order", "relationship_map", "data_flows", "implicit_contracts", "gotchas"]
}
```

## Backward compatibility

Downstream consumers should read `step-result.json` first. If the sidecar is missing, fall back to parsing the primary output file for basic status information.
