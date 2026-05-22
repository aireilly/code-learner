#!/usr/bin/env python3
"""Assemble module summaries and relationship data into a single synthesis context.

Reads summary.json and optionally relationships.json from the agent workspace.
Produces a combined context object for the synthesis agent.

Usage:
    python3 build_synthesis_context.py --base-path /path/to/.agent_workspace/repo-name
"""

import argparse
import json
import os
import sys


def build_context(base_path: str) -> dict:
    summary_path = os.path.join(base_path, "module-analysis", "summary.json")
    relationships_path = os.path.join(base_path, "relationships", "relationships.json")
    detection_path = os.path.join(base_path, "detection", "detection.json")

    if not os.path.exists(summary_path):
        return {"error": f"summary.json not found at {summary_path}"}

    with open(summary_path) as f:
        summaries = json.load(f)

    relationships = []
    if os.path.exists(relationships_path):
        with open(relationships_path) as f:
            relationships = json.load(f)

    detection = {}
    if os.path.exists(detection_path):
        with open(detection_path) as f:
            detection = json.load(f)

    repo_name = os.path.basename(base_path)
    primary_language = detection.get("primary_language", "unknown")

    context = {
        "repo_name": repo_name,
        "primary_language": primary_language,
        "module_count": len(summaries),
        "relationship_count": len(relationships),
        "summaries": summaries,
        "relationships": relationships,
    }

    context_json = json.dumps(context)
    context["context_size_bytes"] = len(context_json.encode("utf-8"))

    return context


def main():
    parser = argparse.ArgumentParser(description="Build synthesis context")
    parser.add_argument("--base-path", required=True, help="Base path for the agent workspace")
    args = parser.parse_args()

    result = build_context(args.base_path)
    json.dump(result, sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
