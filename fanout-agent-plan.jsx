import { useState } from "react";

// ─── Language configs ────────────────────────────────────────────────────────
const LANGS = {
  python:     { label:"Python",     icon:"🐍", color:"#4b9ec8", ext:[".py"],                    unit:"directory of .py files",        config:["README.md","pyproject.toml","setup.py","requirements.txt"], walkerNote:"Group by top-level directory. Each dir = one agent domain." },
  go:         { label:"Go",         icon:"🐹", color:"#00add8", ext:[".go"],                    unit:"package (directory of .go files)",config:["README.md","go.mod","go.sum"],                           walkerNote:"Group by Go package (directory). go.mod defines the module root." },
  javascript: { label:"JavaScript", icon:"⬡",  color:"#f7df1e", ext:[".js",".jsx"],             unit:"directory or feature slice",     config:["README.md","package.json"],                               walkerNote:"Group by top-level src/ directory. index.js files are the public API boundary." },
  typescript: { label:"TypeScript", icon:"🔷", color:"#3178c6", ext:[".ts",".tsx"],             unit:"directory or feature slice",     config:["README.md","package.json","tsconfig.json"],               walkerNote:"Group by top-level src/ directory. index.ts + exported types define the contract." },
};

// ─── Code snippets per language per phase/task ───────────────────────────────
const CODE = {
  // Phase 1
  detect: {
    python:`import os, pathlib, collections

def detect_language(root: str) -> str:
    counts = collections.Counter()
    for _, _, files in os.walk(root):
        for f in files:
            ext = pathlib.Path(f).suffix
            counts[ext] += 1
    EXT_MAP = {".py":"python",".go":"go",
               ".ts":"typescript",".js":"javascript"}
    top = counts.most_common(1)[0][0]
    return EXT_MAP.get(top, "unknown")`,
    go:`func DetectLanguage(root string) string {
    counts := map[string]int{}
    filepath.Walk(root, func(p string, _ os.FileInfo, _ error) error {
        counts[strings.ToLower(filepath.Ext(p))]++
        return nil
    })
    extMap := map[string]string{
        ".go":"go", ".py":"python",
        ".ts":"typescript", ".js":"javascript",
    }
    best, max := "", 0
    for ext, n := range counts {
        if n > max { best, max = ext, n }
    }
    return extMap[best]
}`,
    javascript:`import { readdirSync, statSync } from 'fs';
import path from 'path';

function detectLanguage(root) {
  const counts = {};
  function walk(dir) {
    for (const f of readdirSync(dir)) {
      const full = path.join(dir, f);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const ext = path.extname(f);
        counts[ext] = (counts[ext] || 0) + 1;
      }
    }
  }
  walk(root);
  const extMap = { '.js':'javascript', '.ts':'typescript',
                   '.py':'python', '.go':'go' };
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
  return extMap[top] ?? 'unknown';
}`,
    typescript:`import { readdirSync, statSync } from 'fs';
import path from 'path';

function detectLanguage(root: string): string {
  const counts: Record<string, number> = {};
  function walk(dir: string) {
    for (const f of readdirSync(dir)) {
      const full = path.join(dir, f);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const ext = path.extname(f);
        counts[ext] = (counts[ext] ?? 0) + 1;
      }
    }
  }
  walk(root);
  const extMap: Record<string,string> = {
    '.ts':'typescript', '.tsx':'typescript',
    '.js':'javascript', '.go':'go', '.py':'python'
  };
  const [top] = Object.entries(counts).sort(([,a],[,b]) => b-a);
  return extMap[top[0]] ?? 'unknown';
}`,
  },

  walk: {
    python:`def build_module_map(root: str) -> dict[str, list[str]]:
    modules = {}
    for dirpath, _, files in os.walk(root):
        srcs = [f for f in files if f.endswith(".py")]
        if srcs:
            rel = str(pathlib.Path(dirpath).relative_to(root))
            modules[rel] = [os.path.join(dirpath, f) for f in srcs]
    return modules

# Config files read: pyproject.toml, setup.py,
# requirements.txt, README.md, __init__.py`,
    go:`func BuildPackageMap(root string) map[string][]string {
    modules := map[string][]string{}
    filepath.Walk(root, func(p string, info os.FileInfo, _ error) error {
        if !info.IsDir() && strings.HasSuffix(p, ".go") {
            pkg := filepath.Dir(p)
            rel, _ := filepath.Rel(root, pkg)
            modules[rel] = append(modules[rel], p)
        }
        return nil
    })
    return modules
}
// Config files: go.mod, go.sum, README.md`,
    javascript:`function buildModuleMap(root) {
  const EXTS = ['.js', '.jsx'];
  const modules = {};
  function walk(dir) {
    for (const f of readdirSync(dir)) {
      const full = path.join(dir, f);
      if (statSync(full).isDirectory()) walk(full);
      else if (EXTS.includes(path.extname(f))) {
        const rel = path.relative(root, dir);
        modules[rel] = [...(modules[rel] ?? []), full];
      }
    }
  }
  walk(root);
  return modules;
}
// Config files: package.json, README.md`,
    typescript:`function buildModuleMap(root: string): Record<string,string[]> {
  const EXTS = ['.ts', '.tsx'];
  const modules: Record<string,string[]> = {};
  function walk(dir: string) {
    for (const f of readdirSync(dir)) {
      const full = path.join(dir, f);
      if (statSync(full).isDirectory()) walk(full);
      else if (EXTS.includes(path.extname(f))) {
        const rel = path.relative(root, dir);
        modules[rel] = [...(modules[rel] ?? []), full];
      }
    }
  }
  walk(root);
  return modules;
}
// Config files: package.json, tsconfig.json, README.md`,
  },

  orchestratorPrompt: {
    python:`ORCHESTRATOR_PROMPT = """
You are mapping a Python codebase for engineer onboarding.
Module unit: directory of .py files.

Given the file tree and config files, produce a JSON array:
[{
  "module": "auth",
  "purpose": "one-line description",
  "complexity": "low|medium|high",
  "primary_imports": ["other modules this likely depends on"],
  "question": "specific question for the sub-agent"
}]
Only JSON. No preamble.
"""`,
    go:`const orchestratorPrompt = \`
You are mapping a Go codebase for engineer onboarding.
Module unit: Go package (directory of .go files).

Given the file tree and go.mod, produce a JSON array:
[{
  "module": "internal/auth",
  "purpose": "one-line description",
  "complexity": "low|medium|high",
  "primary_imports": ["other packages this likely imports"],
  "question": "specific question for the sub-agent"
}]
Only JSON. No preamble.
\``,
    javascript:`const ORCHESTRATOR_PROMPT = \`
You are mapping a JavaScript codebase for engineer onboarding.
Module unit: directory or feature slice under src/.

Given the file tree and package.json, produce a JSON array:
[{
  "module": "src/auth",
  "purpose": "one-line description",
  "complexity": "low|medium|high",
  "primary_imports": ["other modules this likely imports"],
  "question": "specific question for the sub-agent"
}]
Only JSON. No preamble.
\``,
    typescript:`const ORCHESTRATOR_PROMPT = \`
You are mapping a TypeScript codebase for engineer onboarding.
Module unit: directory or feature slice. Pay attention to
index.ts barrel files — they define the public API surface.

Given the file tree, package.json, and tsconfig.json paths,
produce a JSON array:
[{
  "module": "src/auth",
  "purpose": "one-line description",
  "complexity": "low|medium|high",
  "primary_imports": ["other modules this likely imports"],
  "exported_types": ["key types/interfaces this module exports"],
  "question": "specific question for the sub-agent"
}]
Only JSON. No preamble.
\``,
  },

  // Phase 2
  loadSource: {
    python:`def load_module_source(files: list[str]) -> str:
    parts = []
    for path in files:
        rel = os.path.relpath(path)
        src = open(path).read()
        parts.append(f"### FILE: {rel}\\n{src}")
    return "\\n\\n".join(parts)
# Keep all imports — they're relationship signal for Phase 2b`,
    go:`func LoadPackageSource(files []string) string {
    var parts []string
    for _, f := range files {
        src, _ := os.ReadFile(f)
        parts = append(parts,
            fmt.Sprintf("### FILE: %s\\n%s", f, src))
    }
    return strings.Join(parts, "\\n\\n")
}
// Keep all import blocks — critical for Phase 2b dep graph`,
    javascript:`function loadModuleSource(files) {
  return files
    .map(f => \`### FILE: \${f}\\n\${readFileSync(f, 'utf8')}\`)
    .join('\\n\\n');
}
// Keep all import/require statements for Phase 2b`,
    typescript:`function loadModuleSource(files: string[]): string {
  return files
    .map(f => \`### FILE: \${f}\\n\${readFileSync(f, 'utf8')}\`)
    .join('\\n\\n');
}
// TypeScript: keep type imports too — they reveal
// interface contracts across module boundaries`,
  },

  subAgentPrompt: {
    python:`SUB_AGENT_PROMPT = """
You are a senior Python engineer onboarding onto a new codebase.
Analyse the module source and answer: {question}

Return ONLY JSON:
{{
  "module": "{name}",
  "language": "python",
  "purpose": "2-3 sentence summary",
  "public_api": ["key exported classes/functions"],
  "dependencies": ["internal modules imported"],
  "external_libs": ["third-party packages used"],
  "data_flow": "how data enters and exits",
  "implicit_contracts": ["assumed interfaces or shared types"],
  "gotchas": ["non-obvious things a new engineer should know"],
  "onboarding_priority": "read-first|read-second|skip"
}}
"""`,
    go:`const subAgentPrompt = \`
You are a senior Go engineer onboarding onto a new codebase.
Analyse the package source and answer: {question}

Return ONLY JSON:
{
  "module": "{name}",
  "language": "go",
  "purpose": "2-3 sentence summary",
  "public_api": ["exported funcs/types/interfaces"],
  "dependencies": ["internal packages imported"],
  "external_libs": ["third-party modules from go.mod"],
  "data_flow": "how data enters and exits",
  "implicit_contracts": ["interface assumptions"],
  "gotchas": ["non-obvious things a new engineer should know"],
  "onboarding_priority": "read-first|read-second|skip"
}
\``,
    javascript:`const SUB_AGENT_PROMPT = \`
You are a senior JavaScript engineer onboarding a new codebase.
Analyse the module source and answer: {question}

Return ONLY JSON:
{
  "module": "{name}",
  "language": "javascript",
  "purpose": "2-3 sentence summary",
  "public_api": ["exported functions/classes/constants"],
  "dependencies": ["internal modules imported"],
  "external_libs": ["npm packages used"],
  "data_flow": "how data enters and exits",
  "implicit_contracts": ["assumed shapes or duck-typed interfaces"],
  "gotchas": ["non-obvious things a new engineer should know"],
  "onboarding_priority": "read-first|read-second|skip"
}
\``,
    typescript:`const SUB_AGENT_PROMPT = \`
You are a senior TypeScript engineer onboarding a new codebase.
Analyse the module source and answer: {question}

Return ONLY JSON:
{
  "module": "{name}",
  "language": "typescript",
  "purpose": "2-3 sentence summary",
  "public_api": ["exported functions/classes/constants"],
  "exported_types": ["exported interfaces/types/enums"],
  "dependencies": ["internal modules imported"],
  "external_libs": ["npm packages used"],
  "data_flow": "how data enters and exits",
  "implicit_contracts": [
    "interfaces assumed but not explicitly imported",
    "structural typing assumptions"
  ],
  "gotchas": ["non-obvious things a new engineer should know"],
  "onboarding_priority": "read-first|read-second|skip"
}
\`
// Note: TypeScript structural typing means implicit contracts
// are especially important to surface — two modules may share
// a shape without a shared import.`,
  },

  fanOut: {
    python:`import asyncio, anthropic, json

client = anthropic.AsyncAnthropic()
SEM = asyncio.Semaphore(5)

async def run_agent(module: str, source: str, question: str):
    async with SEM:
        msg = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            messages=[{"role":"user","content":
                SUB_AGENT_PROMPT.format(question=question, name=module)
                + "\\n\\n" + source
            }]
        )
        return json.loads(msg.content[0].text)

async def fan_out(module_map, registry):
    return await asyncio.gather(*[
        run_agent(m["module"],
                  load_module_source(module_map[m["module"]]),
                  m["question"])
        for m in registry
    ])`,
    go:`func FanOut(modules map[string][]string,
           registry []ModuleEntry) []Summary {
    results := make([]Summary, len(registry))
    sem := make(chan struct{}, 5)
    var wg sync.WaitGroup
    for i, m := range registry {
        wg.Add(1)
        go func(i int, m ModuleEntry) {
            defer wg.Done()
            sem <- struct{}{}; defer func() { <-sem }()
            src := LoadPackageSource(modules[m.Module])
            results[i] = RunAgent(m.Module, src, m.Question)
        }(i, m)
    }
    wg.Wait()
    return results
}`,
    javascript:`import Anthropic from '@anthropic-ai/sdk';
import pLimit from 'p-limit';

const client = new Anthropic();
const limit = pLimit(5);

async function runAgent(module, source, question) {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514', max_tokens: 1024,
    messages: [{ role: 'user', content:
      SUB_AGENT_PROMPT
        .replace('{question}', question)
        .replace('{name}', module)
      + '\\n\\n' + source
    }]
  });
  return JSON.parse(msg.content[0].text);
}

const results = await Promise.all(
  registry.map(m => limit(() =>
    runAgent(m.module, loadModuleSource(moduleMap[m.module]), m.question)
  ))
);`,
    typescript:`import Anthropic from '@anthropic-ai/sdk';
import pLimit from 'p-limit';

const client = new Anthropic();
const limit = pLimit(5);

interface AgentResult {
  module: string; language: string; purpose: string;
  public_api: string[]; exported_types: string[];
  dependencies: string[]; external_libs: string[];
  data_flow: string; implicit_contracts: string[];
  gotchas: string[]; onboarding_priority: string;
}

async function runAgent(
  module: string, source: string, question: string
): Promise<AgentResult> {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514', max_tokens: 1024,
    messages: [{ role: 'user', content:
      SUB_AGENT_PROMPT
        .replace('{question}', question)
        .replace('{name}', module)
      + '\\n\\n' + source
    }]
  });
  return JSON.parse((msg.content[0] as Anthropic.TextBlock).text);
}

const results: AgentResult[] = await Promise.all(
  registry.map(m => limit(() =>
    runAgent(m.module, loadModuleSource(moduleMap[m.module]), m.question)
  ))
);`,
  },

  // Phase 2b
  depPairs: {
    python:`def build_dep_pairs(
    summaries: list[dict],
    module_map: dict
) -> list[tuple[str, str]]:
    seen = set()
    pairs = []
    for s in summaries:
        for dep in s.get("dependencies", []):
            if dep in module_map:
                key = tuple(sorted([s["module"], dep]))
                if key not in seen:
                    seen.add(key)
                    pairs.append((s["module"], dep))
    return pairs`,
    go:`func BuildDepPairs(summaries []Summary,
                  modules map[string][]string) [][2]string {
    seen := map[[2]string]bool{}
    var pairs [][2]string
    for _, s := range summaries {
        for _, dep := range s.Dependencies {
            if _, ok := modules[dep]; ok {
                key := [2]string{s.Module, dep}
                if s.Module > dep {
                    key = [2]string{dep, s.Module}
                }
                if !seen[key] {
                    seen[key] = true
                    pairs = append(pairs, key)
                }
            }
        }
    }
    return pairs
}`,
    javascript:`function buildDepPairs(summaries, moduleMap) {
  const seen = new Set();
  const pairs = [];
  for (const s of summaries) {
    for (const dep of s.dependencies ?? []) {
      if (dep in moduleMap) {
        const key = [s.module, dep].sort().join('|');
        if (!seen.has(key)) {
          seen.add(key);
          pairs.push([s.module, dep]);
        }
      }
    }
  }
  return pairs;
}`,
    typescript:`function buildDepPairs(
  summaries: AgentResult[],
  moduleMap: Record<string, string[]>
): [string, string][] {
  const seen = new Set<string>();
  const pairs: [string, string][] = [];
  for (const s of summaries) {
    for (const dep of s.dependencies ?? []) {
      if (dep in moduleMap) {
        const key = [s.module, dep].sort().join('|');
        if (!seen.has(key)) {
          seen.add(key);
          pairs.push([s.module, dep]);
        }
      }
    }
  }
  return pairs;
}
// Also extract type-import pairs — TypeScript modules
// may share types without appearing in runtime deps`,
  },

  relationshipPrompt: {
    python:`RELATIONSHIP_PROMPT = """
Analyse the relationship between two Python modules.

MODULE A: {mod_a}
{src_a}

MODULE B: {mod_b}
{src_b}

Return ONLY JSON:
{{
  "pair": ["{mod_a}", "{mod_b}"],
  "coupling_type":
    "data-shape|interface-contract|config|inheritance|event|none",
  "description": "precise description of the coupling",
  "shared_types": ["types/dataclasses used by both"],
  "implicit_assumptions":
    ["what A assumes about B and vice versa"],
  "risk": "what breaks if this coupling is misunderstood",
  "strength": "tight|loose|none"
}}
"""`,
    go:`const relationshipPrompt = \`
Analyse the relationship between two Go packages.

PACKAGE A: {mod_a}
{src_a}

PACKAGE B: {mod_b}
{src_b}

Return ONLY JSON:
{
  "pair": ["{mod_a}", "{mod_b}"],
  "coupling_type":
    "interface-contract|data-shape|config|embedding|channel|none",
  "description": "precise description of the coupling",
  "shared_types": ["interfaces/structs used by both"],
  "implicit_assumptions": ["what A assumes about B"],
  "risk": "what breaks if this coupling is misunderstood",
  "strength": "tight|loose|none"
}
\`
// Go: especially look for interface satisfaction —
// a type in pkg A may implement an interface in pkg B
// without an explicit import`,
    javascript:`const RELATIONSHIP_PROMPT = \`
Analyse the relationship between two JavaScript modules.

MODULE A: {mod_a}
{src_a}

MODULE B: {mod_b}
{src_b}

Return ONLY JSON:
{
  "pair": ["{mod_a}", "{mod_b}"],
  "coupling_type":
    "data-shape|event|config|duck-typing|callback|none",
  "description": "precise description of the coupling",
  "shared_types": ["object shapes used by both"],
  "implicit_assumptions": ["what A assumes about B"],
  "risk": "what breaks if this coupling is misunderstood",
  "strength": "tight|loose|none"
}
\``,
    typescript:`const RELATIONSHIP_PROMPT = \`
Analyse the relationship between two TypeScript modules.
Pay special attention to structural typing — two modules may
share a type shape without a direct import.

MODULE A: {mod_a}
{src_a}

MODULE B: {mod_b}
{src_b}

Return ONLY JSON:
{
  "pair": ["{mod_a}", "{mod_b}"],
  "coupling_type":
    "explicit-type-import|structural-subtype|data-shape|
     event|config|generic-constraint|none",
  "description": "precise description of the coupling",
  "shared_types": [
    "types/interfaces shared or structurally compatible"
  ],
  "implicit_assumptions": [
    "structural subtype assumptions",
    "generic constraints assumed"
  ],
  "risk": "what breaks if this coupling is misunderstood",
  "strength": "tight|loose|none"
}
\`
// TypeScript-specific: check for structural subtyping —
// { id: string; name: string } in module A may satisfy
// interface User in module B with no shared import`,
  },

  extractAPI: {
    python:`def extract_public_api(files: list[str]) -> str:
    """Public API surface only — for the 'other' side of a pair."""
    import ast
    parts = []
    for path in files:
        src = open(path).read()
        tree = ast.parse(src)
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.ClassDef)):
                if not node.name.startswith("_"):
                    snippet = ast.get_source_segment(src, node)
                    if snippet:
                        parts.append(snippet[:400])
    return "\\n".join(parts)`,
    go:`// Extract only exported declarations for the API surface
func ExtractPublicAPI(files []string) string {
    var parts []string
    for _, f := range files {
        src, _ := os.ReadFile(f)
        fset := token.NewFileSet()
        file, _ := parser.ParseFile(fset, f, src, 0)
        for name, obj := range file.Scope.Objects {
            if unicode.IsUpper(rune(name[0])) {
                parts = append(parts,
                    fmt.Sprintf("%s %s", obj.Kind, name))
            }
        }
    }
    return strings.Join(parts, "\\n")
}`,
    javascript:`// Extract only export statements for API surface
function extractPublicAPI(files) {
  return files.flatMap(f => {
    const src = readFileSync(f, 'utf8');
    return src.split('\\n')
      .filter(l => l.trim().startsWith('export'))
      .map(l => l.slice(0, 200));
  }).join('\\n');
}`,
    typescript:`import * as ts from 'typescript';

// Extract exported declarations + type signatures
function extractPublicAPI(files: string[]): string {
  const parts: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const sf = ts.createSourceFile(
      f, src, ts.ScriptTarget.Latest, true
    );
    sf.statements.forEach(s => {
      const isExported = (s as any).modifiers?.some(
        (m: ts.Modifier) => m.kind === ts.SyntaxKind.ExportKeyword
      );
      if (isExported) {
        parts.push(src.slice(s.pos, s.end).substring(0, 400));
      }
    });
  }
  return parts.join('\\n');
}
// For TypeScript: extracting type aliases, interfaces,
// and enums is as important as function signatures`,
  },

  // Phase 3
  synthesis: {
    python:`def build_synthesis_prompt(summaries, relationships, lang):
    return f"""
You are writing an onboarding guide for a {lang} engineer.

MODULE SUMMARIES:
{json.dumps(summaries, indent=2)}

CROSS-MODULE RELATIONSHIPS:
{json.dumps(relationships, indent=2)}

Produce a markdown onboarding document:
1. Architecture overview (narrative)
2. Relationship map (tight vs loose couplings)
3. Reading order with rationale
4. Key data flows end-to-end (trace 2-3 real paths)
5. Implicit contracts to know before touching the code
6. Top 5 gotchas for new engineers
"""`,
    go:`func BuildSynthesisPrompt(
    summaries []Summary,
    relationships []Relationship,
    lang string,
) string {
    s, _ := json.MarshalIndent(summaries, "", "  ")
    r, _ := json.MarshalIndent(relationships, "", "  ")
    return fmt.Sprintf(\`
You are writing an onboarding guide for a %s engineer.

MODULE SUMMARIES: %s

CROSS-MODULE RELATIONSHIPS: %s

Produce a markdown onboarding document:
1. Architecture overview (narrative)
2. Relationship map (tight vs loose couplings)
3. Reading order with rationale
4. Key data flows end-to-end
5. Implicit contracts (especially interface satisfaction)
6. Top 5 gotchas for new engineers
\`, lang, s, r)
}`,
    javascript:`function buildSynthesisPrompt(summaries, relationships, lang) {
  return \`
You are writing an onboarding guide for a \${lang} engineer.

MODULE SUMMARIES:
\${JSON.stringify(summaries, null, 2)}

CROSS-MODULE RELATIONSHIPS:
\${JSON.stringify(relationships, null, 2)}

Produce a markdown onboarding document:
1. Architecture overview (narrative)
2. Relationship map (tight vs loose couplings)
3. Reading order with rationale
4. Key data flows end-to-end (trace 2-3 real paths)
5. Implicit contracts and duck-typing assumptions
6. Top 5 gotchas for new engineers
\`;
}`,
    typescript:`function buildSynthesisPrompt(
  summaries: AgentResult[],
  relationships: RelationshipResult[],
  lang: string
): string {
  return \`
You are writing an onboarding guide for a \${lang} engineer.

MODULE SUMMARIES:
\${JSON.stringify(summaries, null, 2)}

CROSS-MODULE RELATIONSHIPS:
\${JSON.stringify(relationships, null, 2)}

Produce a markdown onboarding document:
1. Architecture overview (narrative)
2. Relationship map (tight vs loose couplings)
3. Type dependency graph (which modules export types
   consumed by others)
4. Reading order with rationale
5. Key data flows end-to-end (trace 2-3 real paths)
6. Structural typing traps — where implicit subtype
   assumptions could cause runtime surprises
7. Top 5 gotchas for new TypeScript engineers
\`;
}`,
  },

  // Phase 4
  cache: {
    python:`import hashlib, sqlite3, json

def cache_key(files: list[str]) -> str:
    content = b"".join(open(f,"rb").read() for f in files)
    return hashlib.sha256(content).hexdigest()[:16]

def load_cached(module, key, db):
    row = db.execute(
        "SELECT summary FROM cache WHERE module=? AND key=?",
        (module, key)
    ).fetchone()
    return json.loads(row[0]) if row else None`,
    go:`func CacheKey(files []string) string {
    h := sha256.New()
    for _, f := range files {
        b, _ := os.ReadFile(f)
        h.Write(b)
    }
    return fmt.Sprintf("%x", h.Sum(nil))[:16]
}

func LoadCached(db *sql.DB, module, key string) *Summary {
    var raw string
    err := db.QueryRow(
        "SELECT summary FROM cache WHERE module=? AND key=?",
        module, key,
    ).Scan(&raw)
    if err != nil { return nil }
    var s Summary
    json.Unmarshal([]byte(raw), &s)
    return &s
}`,
    javascript:`import crypto from 'crypto';
import Database from 'better-sqlite3';

function cacheKey(files) {
  const hash = crypto.createHash('sha256');
  for (const f of files) hash.update(readFileSync(f));
  return hash.digest('hex').slice(0, 16);
}

function loadCached(db, module, key) {
  const row = db.prepare(
    'SELECT summary FROM cache WHERE module=? AND key=?'
  ).get(module, key);
  return row ? JSON.parse(row.summary) : null;
}`,
    typescript:`import crypto from 'crypto';
import Database from 'better-sqlite3';

function cacheKey(files: string[]): string {
  const hash = crypto.createHash('sha256');
  for (const f of files) hash.update(readFileSync(f));
  return hash.digest('hex').slice(0, 16);
}

function loadCached(
  db: Database.Database, module: string, key: string
): AgentResult | null {
  const row = db.prepare(
    'SELECT summary FROM cache WHERE module=? AND key=?'
  ).get(module, key) as { summary: string } | undefined;
  return row ? JSON.parse(row.summary) as AgentResult : null;
}`,
  },

  gitdiff: {
    python:`import subprocess

def changed_modules(module_map: dict) -> set[str]:
    diff = subprocess.check_output(
        ["git","diff","--name-only","HEAD~1","HEAD"]
    ).decode().splitlines()
    changed = set()
    for module, files in module_map.items():
        rel = [os.path.relpath(f) for f in files]
        if any(f in diff for f in rel):
            changed.add(module)
    return changed

def stale_pairs(changed, pairs):
    return [(a,b) for a,b in pairs
            if a in changed or b in changed]`,
    go:`func ChangedModules(
    root string,
    modules map[string][]string,
) map[string]bool {
    out, _ := exec.Command(
        "git","diff","--name-only","HEAD~1","HEAD",
    ).Output()
    diff := strings.Split(strings.TrimSpace(string(out)), "\\n")
    diffSet := map[string]bool{}
    for _, f := range diff { diffSet[f] = true }

    changed := map[string]bool{}
    for mod, files := range modules {
        for _, f := range files {
            rel, _ := filepath.Rel(root, f)
            if diffSet[rel] { changed[mod] = true; break }
        }
    }
    return changed
}`,
    javascript:`import { execSync } from 'child_process';

function changedModules(moduleMap) {
  const diff = execSync('git diff --name-only HEAD~1 HEAD')
    .toString().trim().split('\\n');
  const diffSet = new Set(diff);
  const changed = new Set();
  for (const [mod, files] of Object.entries(moduleMap)) {
    if (files.some(f => diffSet.has(path.relative('.', f))))
      changed.add(mod);
  }
  return changed;
}

function stalePairs(changed, pairs) {
  return pairs.filter(([a,b]) =>
    changed.has(a) || changed.has(b));
}`,
    typescript:`import { execSync } from 'child_process';

function changedModules(
  moduleMap: Record<string, string[]>
): Set<string> {
  const diff = execSync('git diff --name-only HEAD~1 HEAD')
    .toString().trim().split('\\n');
  const diffSet = new Set(diff);
  const changed = new Set<string>();
  for (const [mod, files] of Object.entries(moduleMap)) {
    if (files.some(f => diffSet.has(path.relative('.', f))))
      changed.add(mod);
  }
  return changed;
}

function stalePairs(
  changed: Set<string>,
  pairs: [string,string][]
): [string,string][] {
  return pairs.filter(([a,b]) => changed.has(a)||changed.has(b));
}`,
  },
};

// ─── Phase definitions ───────────────────────────────────────────────────────
const PHASES = (lang) => [
  {
    id:"phase1", number:"01", title:"Repo Mapper",
    subtitle:"Orchestrator — runs once",
    duration:"~10s · 1 API call", color:"#c8a84b", icon:"◈",
    goal:"Auto-detect language, walk the file tree, read config files, and produce a per-module registry with a tailored question for each sub-agent.",
    tasks:[
      { label:"Language detection",   detail:"Count file extensions to detect the primary language. Falls back to a --lang flag. Polyglot repos can run multiple walkers in parallel.", key:"detect" },
      { label:"Walk & group modules", detail:`Group source files into modules. For ${LANGS[lang]?.label}: ${LANGS[lang]?.walkerNote} Config files: ${LANGS[lang]?.config?.join(", ")}.`, key:"walk" },
      { label:"Orchestrator prompt",  detail:"Ask Claude to produce a JSON module registry: name, purpose, complexity, likely imports, and a specific tailored question per module.", key:"orchestratorPrompt" },
    ],
  },
  {
    id:"phase2", number:"02", title:"Sub-Agent Fan-Out",
    subtitle:"Parallel — one agent per module",
    duration:"~30–90s · N parallel calls", color:"#4b9ec8", icon:"⟁",
    goal:"Each agent receives the full source of its module — no chunking, no embeddings. Just raw code and a sharp question.",
    tasks:[
      { label:"Load full source",      detail:"Concatenate all source files with clear file headers. Keep all imports intact — they're the relationship signal consumed by Phase 2b.", key:"loadSource" },
      { label:"Sub-agent prompt",      detail:`Language-specific prompt schema. ${lang === "typescript" ? "TypeScript adds exported_types and structural subtype awareness to the output." : lang === "go" ? "Go adds interface satisfaction detection." : ""}`, key:"subAgentPrompt" },
      { label:"Parallel execution",    detail:"Semaphore-capped async fan-out. Max 5 concurrent calls to respect rate limits while staying fast.", key:"fanOut" },
    ],
  },
  {
    id:"phase2b", number:"2b", title:"Relationship Pass",
    subtitle:"Parallel — one agent per dep pair",
    duration:"~20–40s · dep-graph calls", color:"#e87a3a", icon:"⇌",
    goal:"Catch implicit couplings single-module agents miss: shared types, interface contracts, structural subtyping (TS), implicit interface satisfaction (Go), duck-typing (JS).",
    tasks:[
      { label:"Build dep pairs",        detail:"Extract declared dependencies from Phase 2 summaries. For each edge A→B, create one relationship agent. Deduplicate reversed pairs.", key:"depPairs" },
      { label:"Relationship prompt",    detail:`Language-aware prompt. ${lang === "typescript" ? "TypeScript prompt explicitly hunts structural subtype coupling — two modules sharing a type shape without a direct import." : lang === "go" ? "Go prompt explicitly hunts interface satisfaction across package boundaries." : lang === "javascript" ? "JS prompt looks for duck-typing and callback shape assumptions." : "Looks for shared types, data shapes, and implicit contracts."}`, key:"relationshipPrompt" },
      { label:"Overlap loading",        detail:"For large modules, load full source for module A and only the public API surface for module B. Cuts token cost ~40% while preserving relationship signal.", key:"extractAPI" },
    ],
  },
  {
    id:"phase3", number:"03", title:"Synthesis Agent",
    subtitle:"Orchestrator — final pass",
    duration:"~15s · 1 API call", color:"#4bc87a", icon:"◎",
    goal:"Combines all module summaries + relationship pairs in one call. Produces the full onboarding document with architecture narrative, relationship map, reading order, and data flows.",
    tasks:[
      { label:"Assemble context",   detail:"Module summaries (~15 × 400 tokens) + relationship pairs (~20 × 200 tokens) ≈ 10K tokens. Comfortably fits in one synthesis call with room to spare.", key:"synthesis" },
      { label:"Save outputs",       detail:"Three outputs: ONBOARDING.md for humans, dependency_graph.json for tooling, relationships.json for incremental re-runs.", key:"synthesis" },
    ],
  },
  {
    id:"phase4", number:"04", title:"Cache & Refresh",
    subtitle:"Ongoing — git-diff driven",
    duration:"Incremental on commit", color:"#b44bc8", icon:"↻",
    goal:"Cache per-module summaries and relationship pairs keyed by content hash. Re-run only what git diff touched.",
    tasks:[
      { label:"Content-hash cache", detail:"SHA256 of the module's source files. Language-agnostic — the same SQLite cache layer works for Python, Go, JS, and TS repos.", key:"cache" },
      { label:"Git-diff trigger",   detail:"On each commit, only re-run agents for modules containing changed files. Relationship pass re-runs for any pair where either side changed.", key:"gitdiff" },
    ],
  },
];

const COSTS = {
  python:     [
    { label:"Phase 1 — Orchestrator map",           calls:1,  cost:"~$0.005" },
    { label:"Phase 2 — Sub-agents (×15 modules)",   calls:15, cost:"~$0.30"  },
    { label:"Phase 2b — Relationship pass (×20)",   calls:20, cost:"~$0.18"  },
    { label:"Phase 3 — Synthesis",                  calls:1,  cost:"~$0.025" },
    { label:"Total (first run)",                    calls:37, cost:"~$0.51", total:true },
    { label:"Incremental re-run (5 modules changed)",calls:9, cost:"~$0.13", inc:true },
  ],
  go:         [
    { label:"Phase 1 — Orchestrator map",           calls:1,  cost:"~$0.005" },
    { label:"Phase 2 — Sub-agents (×12 packages)",  calls:12, cost:"~$0.22"  },
    { label:"Phase 2b — Relationship pass (×15)",   calls:15, cost:"~$0.13"  },
    { label:"Phase 3 — Synthesis",                  calls:1,  cost:"~$0.02"  },
    { label:"Total (first run)",                    calls:29, cost:"~$0.38", total:true },
    { label:"Incremental re-run (5 packages changed)",calls:8,cost:"~$0.11", inc:true },
  ],
  javascript: [
    { label:"Phase 1 — Orchestrator map",           calls:1,  cost:"~$0.005" },
    { label:"Phase 2 — Sub-agents (×18 modules)",   calls:18, cost:"~$0.35"  },
    { label:"Phase 2b — Relationship pass (×25)",   calls:25, cost:"~$0.22"  },
    { label:"Phase 3 — Synthesis",                  calls:1,  cost:"~$0.025" },
    { label:"Total (first run)",                    calls:45, cost:"~$0.60", total:true },
    { label:"Incremental re-run (5 modules changed)",calls:11,cost:"~$0.15", inc:true },
  ],
  typescript: [
    { label:"Phase 1 — Orchestrator map",           calls:1,  cost:"~$0.005" },
    { label:"Phase 2 — Sub-agents (×18 modules)",   calls:18, cost:"~$0.35"  },
    { label:"Phase 2b — Relationship pass (×25)",   calls:25, cost:"~$0.24"  },
    { label:"Phase 3 — Synthesis",                  calls:1,  cost:"~$0.025" },
    { label:"Total (first run)",                    calls:45, cost:"~$0.62", total:true },
    { label:"Incremental re-run (5 modules changed)",calls:11,cost:"~$0.16", inc:true },
  ],
};

const FILES = {
  python:[
    { path:"detector.py",       desc:"Language + module map detection" },
    { path:"orchestrator.py",   desc:"Phase 1 + 3: map and synthesis" },
    { path:"agents.py",         desc:"Phase 2: asyncio fan-out + prompts" },
    { path:"relationships.py",  desc:"Phase 2b: dep pairs + relationship agents" },
    { path:"cache.py",          desc:"SQLite cache + git diff trigger" },
    { path:"prompts.py",        desc:"All prompt templates as constants" },
    { path:"main.py",           desc:"CLI entry point" },
    { path:"ONBOARDING.md",     desc:"← Generated output", out:true },
    { path:"relationships.json",desc:"← Generated relationship map", out:true },
  ],
  go:[
    { path:"cmd/main.go",                                desc:"CLI entry point" },
    { path:"internal/detector/detector.go",              desc:"Language + package map detection" },
    { path:"internal/orchestrator/orchestrator.go",      desc:"Phase 1 + 3: map and synthesis" },
    { path:"internal/agents/agents.go",                  desc:"Phase 2: goroutine fan-out" },
    { path:"internal/relationships/relationships.go",    desc:"Phase 2b: dep pairs + relationship agents" },
    { path:"internal/cache/cache.go",                    desc:"SQLite cache + git diff" },
    { path:"ONBOARDING.md",                              desc:"← Generated output", out:true },
    { path:"relationships.json",                         desc:"← Generated relationship map", out:true },
  ],
  javascript:[
    { path:"src/detector.js",       desc:"Language + module map detection" },
    { path:"src/orchestrator.js",   desc:"Phase 1 + 3: map and synthesis" },
    { path:"src/agents.js",         desc:"Phase 2: p-limit fan-out + prompts" },
    { path:"src/relationships.js",  desc:"Phase 2b: dep pairs + relationship agents" },
    { path:"src/cache.js",          desc:"better-sqlite3 cache + git diff" },
    { path:"src/prompts.js",        desc:"All prompt templates" },
    { path:"src/index.js",          desc:"CLI entry point" },
    { path:"ONBOARDING.md",         desc:"← Generated output", out:true },
    { path:"relationships.json",    desc:"← Generated relationship map", out:true },
  ],
  typescript:[
    { path:"src/detector.ts",        desc:"Language + module map detection" },
    { path:"src/orchestrator.ts",    desc:"Phase 1 + 3: map and synthesis" },
    { path:"src/agents.ts",          desc:"Phase 2: p-limit fan-out + typed prompts" },
    { path:"src/relationships.ts",   desc:"Phase 2b: structural subtype detection" },
    { path:"src/cache.ts",           desc:"better-sqlite3 cache + git diff" },
    { path:"src/prompts.ts",         desc:"All prompt templates as typed constants" },
    { path:"src/types.ts",           desc:"Shared AgentResult, RelationshipResult types" },
    { path:"src/index.ts",           desc:"CLI entry point" },
    { path:"ONBOARDING.md",          desc:"← Generated output", out:true },
    { path:"relationships.json",     desc:"← Generated relationship map", out:true },
  ],
};

const CLI = {
  python:     "python main.py --repo ./myrepo\npython main.py --repo ./myrepo --incremental\npython main.py --repo ./myrepo --ask \"How does auth flow into the API layer?\"",
  go:         "go run ./cmd/main.go --repo ./myrepo\ngo run ./cmd/main.go --repo ./myrepo --incremental\ngo run ./cmd/main.go --repo ./myrepo --ask \"How does auth flow into the API layer?\"",
  javascript: "node src/index.js --repo ./myrepo\nnode src/index.js --repo ./myrepo --incremental\nnode src/index.js --repo ./myrepo --ask \"How does auth flow into the API layer?\"",
  typescript: "npx ts-node src/index.ts --repo ./myrepo\nnpx ts-node src/index.ts --repo ./myrepo --incremental\nnpx ts-node src/index.ts --repo ./myrepo --ask \"Where are structural subtype assumptions in auth?\"",
};

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [lang, setLang]           = useState("python");
  const [activePhase, setActivePhase] = useState("phase1");
  const [activeTask, setActiveTask]   = useState(0);
  const [tab, setTab]             = useState("plan");

  const phases   = PHASES(lang);
  const phase    = phases.find(p => p.id === activePhase);
  const L        = LANGS[lang];
  const codeKey  = phase?.tasks[activeTask]?.key;
  const codeSnip = codeKey ? (CODE[codeKey]?.[lang] ?? "// snippet not yet defined for this language") : "";

  const switchLang = (l) => { setLang(l); setActiveTask(0); };
  const switchPhase = (id) => { setActivePhase(id); setActiveTask(0); };

  return (
    <div style={{ minHeight:"100vh", background:"#07090f", color:"#c4cdd8",
      fontFamily:"'Fira Code','Cascadia Code',monospace", fontSize:13 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@300;400;500;600&family=Syne:wght@700;800&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:3px; height:3px; }
        ::-webkit-scrollbar-thumb { background:#1e2a3a; border-radius:2px; }
      `}</style>

      {/* ── Top bar ── */}
      <div style={{ borderBottom:"1px solid #111820", padding:"12px 18px",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        background:"#070a0f", flexWrap:"wrap", gap:8 }}>

        <div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:800,
            color:"#e0e8f0", letterSpacing:"-0.02em" }}>Fan-Out Agent Plan</div>
          <div style={{ fontSize:10, color:"#2a3a4a", marginTop:1 }}>
            5 phases · relationship-aware · medium repo · onboarding
          </div>
        </div>

        {/* language switcher */}
        <div style={{ display:"flex", gap:2, background:"#0a0d14", padding:3, borderRadius:8, flexWrap:"wrap" }}>
          {Object.entries(LANGS).map(([k,v]) => (
            <button key={k} onClick={() => switchLang(k)} style={{
              padding:"4px 11px", borderRadius:6, border:"none",
              background: lang===k ? v.color+"22" : "transparent",
              color: lang===k ? v.color : "#2a3a4a",
              fontSize:11, fontFamily:"'Fira Code',monospace", cursor:"pointer",
              borderBottom: lang===k ? `2px solid ${v.color}` : "2px solid transparent",
              transition:"all 0.15s",
            }}>{v.icon} {v.label}</button>
          ))}
        </div>

        {/* tab switcher */}
        <div style={{ display:"flex", gap:2 }}>
          {["plan","cost","files"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding:"4px 11px", borderRadius:6, border:"none",
              background: tab===t ? "#141c28" : "transparent",
              color: tab===t ? "#c4cdd8" : "#2a3a4a",
              fontFamily:"'Fira Code',monospace", fontSize:10,
              cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.08em",
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* ── Plan tab ── */}
      {tab==="plan" && (
        <div style={{ display:"flex", height:"calc(100vh - 55px)" }}>

          {/* phase sidebar */}
          <div style={{ width:160, borderRight:"1px solid #111820",
            padding:"10px 0", display:"flex", flexDirection:"column",
            gap:1, overflowY:"auto", flexShrink:0 }}>
            {phases.map(p => (
              <button key={p.id} onClick={() => switchPhase(p.id)} style={{
                padding:"9px 12px", background: activePhase===p.id ? "#0e1520" : "transparent",
                border:"none", borderLeft:`3px solid ${activePhase===p.id ? p.color : "transparent"}`,
                cursor:"pointer", textAlign:"left", transition:"all 0.15s",
              }}>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:17, fontWeight:800,
                  color: activePhase===p.id ? p.color : "#1a2535", lineHeight:1 }}>{p.number}</div>
                <div style={{ fontSize:10, color: activePhase===p.id ? "#c4cdd8" : "#2a3a4a",
                  marginTop:2, fontWeight:500 }}>{p.title}</div>
                {p.id==="phase2b" && (
                  <div style={{ fontSize:8, color:"#e87a3a", marginTop:1, letterSpacing:"0.05em" }}>● NEW</div>
                )}
                <div style={{ fontSize:9, color: activePhase===p.id ? p.color : "#1a2535", marginTop:1 }}>
                  {p.duration}</div>
              </button>
            ))}
          </div>

          {/* main content */}
          <div style={{ flex:1, overflowY:"auto", padding:"18px 22px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:5 }}>
              <span style={{ fontSize:19, color:phase.color }}>{phase.icon}</span>
              <div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700, color:"#e0e8f0", display:"flex", alignItems:"center", gap:8 }}>
                  {phase.title}
                  {phase.id==="phase2b" && (
                    <span style={{ fontSize:9, background:"#e87a3a22", color:"#e87a3a",
                      padding:"2px 7px", borderRadius:4, border:"1px solid #e87a3a44" }}>
                      RELATIONSHIP PASS
                    </span>
                  )}
                </div>
                <div style={{ fontSize:10, color:"#2a3a4a" }}>{phase.subtitle}</div>
              </div>
            </div>

            <div style={{ fontSize:12, color:"#5a7090", marginBottom:14,
              paddingLeft:29, lineHeight:1.65 }}>{phase.goal}</div>

            {/* task tabs */}
            <div style={{ display:"flex", gap:2, marginBottom:12,
              borderBottom:"1px solid #111820", paddingBottom:10, flexWrap:"wrap" }}>
              {phase.tasks.map((t,i) => (
                <button key={i} onClick={() => setActiveTask(i)} style={{
                  padding:"4px 10px", borderRadius:5,
                  border:`1px solid ${activeTask===i ? phase.color+"55" : "#111820"}`,
                  background: activeTask===i ? phase.color+"15" : "transparent",
                  color: activeTask===i ? phase.color : "#2a3a4a",
                  fontSize:10, cursor:"pointer",
                  fontFamily:"'Fira Code',monospace", transition:"all 0.15s",
                }}>{t.label}</button>
              ))}
            </div>

            {/* task detail + code */}
            {phase.tasks[activeTask] && (
              <div>
                <p style={{ fontSize:12, color:"#7090a8", lineHeight:1.75, marginBottom:13 }}>
                  {phase.tasks[activeTask].detail}
                </p>
                <div style={{ background:"#050709",
                  border:`1px solid ${phase.color}22`, borderRadius:8, overflow:"hidden" }}>
                  <div style={{ padding:"6px 13px", background:phase.color+"0d",
                    borderBottom:`1px solid ${phase.color}22`,
                    fontSize:9, color:phase.color, letterSpacing:"0.12em",
                    display:"flex", alignItems:"center", gap:6 }}>
                    <span>{L.icon}</span><span>{L.label.toUpperCase()}</span>
                  </div>
                  <pre style={{ padding:"13px", fontSize:10.5, color:"#7ab0d0",
                    lineHeight:1.85, overflowX:"auto", whiteSpace:"pre" }}>
                    {codeSnip}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Cost tab ── */}
      {tab==="cost" && (
        <div style={{ padding:"24px" }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700,
            color:"#e0e8f0", marginBottom:3 }}>Cost Estimate</div>
          <div style={{ fontSize:11, color:"#2a3a4a", marginBottom:18 }}>
            {L.icon} {L.label} · claude-sonnet-4 · medium repo
          </div>
          <div style={{ background:"#0a0d14", border:"1px solid #111820",
            borderRadius:10, overflow:"hidden" }}>
            <div style={{ display:"grid", gridTemplateColumns:"3fr 1fr 1fr",
              background:"#070a0f", borderBottom:"1px solid #111820" }}>
              {["Phase","API Calls","Est. Cost"].map((h,i) => (
                <div key={h} style={{ padding:"9px 14px", fontSize:10, color:"#2a3a4a",
                  letterSpacing:"0.08em",
                  borderRight: i<2 ? "1px solid #111820" : "none" }}>{h.toUpperCase()}</div>
              ))}
            </div>
            {COSTS[lang].map((row,i) => (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"3fr 1fr 1fr",
                borderBottom: i<COSTS[lang].length-1 ? "1px solid #0d1018" : "none",
                background: row.total ? "#0e1520" : row.inc ? "#0a0e14" : "transparent" }}>
                <div style={{ padding:"9px 14px", fontSize:12,
                  color: row.total ? "#e0e8f0" : row.inc ? "#9090a8" : "#7090a8",
                  borderRight:"1px solid #0d1018",
                  fontWeight: row.total ? 600 : 400 }}>{row.label}</div>
                <div style={{ padding:"9px 14px", fontSize:12, color:"#4a6a88",
                  borderRight:"1px solid #0d1018" }}>{row.calls}</div>
                <div style={{ padding:"9px 14px", fontSize:12,
                  color: row.total ? "#4bc87a" : row.inc ? "#7090a8" : "#4a6a88",
                  fontWeight: row.total ? 600 : 400 }}>{row.cost}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop:12, padding:"11px 14px", background:"#0a0d14",
            border:"1px solid #111820", borderRadius:8, fontSize:11,
            color:"#3a5a78", lineHeight:1.7 }}>
            💡 Phase 2b adds ~35% cost but is the critical pass for relationship capture.
            After the first run, incremental cost stays low — only modules touched by git diff re-run.
            {lang==="typescript" && " TypeScript's structural typing means 2b often surfaces more than other languages."}
          </div>
        </div>
      )}

      {/* ── Files tab ── */}
      {tab==="files" && (
        <div style={{ padding:"24px" }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:14, fontWeight:700,
            color:"#e0e8f0", marginBottom:3 }}>Project Structure</div>
          <div style={{ fontSize:11, color:"#2a3a4a", marginBottom:18 }}>
            {L.icon} {L.label} implementation
          </div>
          <div style={{ background:"#050709", border:"1px solid #111820",
            borderRadius:10, overflow:"hidden" }}>
            <div style={{ padding:"9px 15px", background:"#070a0f",
              borderBottom:"1px solid #111820", fontSize:10,
              color:"#2a3a4a", letterSpacing:"0.08em" }}>
              ./codebase-agents/
            </div>
            {FILES[lang].map((f,i) => (
              <div key={f.path} style={{ display:"flex", alignItems:"center", gap:14,
                padding:"10px 15px",
                borderBottom: i<FILES[lang].length-1 ? "1px solid #0a0d14" : "none",
                background: f.out ? "#0a0e14" : "transparent" }}>
                <span style={{ fontSize:11, minWidth:220,
                  color: f.out ? "#4bc87a" : L.color }}>
                  {f.out ? "📄 " : lang==="go" ? "🐹 " : lang==="typescript" ? "🔷 " : lang==="javascript" ? "⬡ " : "🐍 "}{f.path}
                </span>
                <span style={{ fontSize:11, color:"#2a3a4a" }}>{f.desc}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop:14, padding:"12px 15px", background:"#0a0d14",
            border:"1px solid #111820", borderRadius:8 }}>
            <div style={{ fontSize:9, color:L.color, letterSpacing:"0.1em", marginBottom:8 }}>
              ENTRY POINT
            </div>
            <pre style={{ fontSize:10.5, color:"#5a8ab0", lineHeight:1.85, overflowX:"auto" }}>
              {CLI[lang]}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
