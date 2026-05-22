#!/usr/bin/env node
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { parse as parseYaml } from "yaml";

import { renderContextBlock, SYSTEM_PROMPT_BASE } from "../runtime/prompt";
import {
  DEFAULT_MODEL,
  runConversationalAgentTurn,
} from "../runtime/runAgent";
import type {
  AgentTrace,
  EvalCase,
  EvalTrace,
  RunIndexEntry,
  RunManifest,
  WorldFixture,
} from "../runtime/types";

const PKG_ROOT = path.resolve(__dirname, "../..");
const REPO_ROOT = path.resolve(PKG_ROOT, "../..");
const CASES_DIR = path.join(PKG_ROOT, "cases");
const WORLDS_DIR = path.join(PKG_ROOT, "fixtures", "worlds");
const DEFAULT_RUNS_DIR = path.join(PKG_ROOT, "runs");
const RUNS_INDEX_FILE = path.join(DEFAULT_RUNS_DIR, "index.json");

interface CliArgs {
  caseId?: string;
  all: boolean;
  list: boolean;
  sample: boolean;
  outDir?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { all: false, list: false, sample: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") args.all = true;
    else if (a === "--list") args.list = true;
    else if (a === "--sample") args.sample = true;
    else if (a === "--case" && argv[i + 1]) {
      args.caseId = argv[++i];
    } else if (a === "--out" && argv[i + 1]) {
      args.outDir = argv[++i];
    }
  }
  return args;
}

function loadCases(): EvalCase[] {
  const files = fs
    .readdirSync(CASES_DIR)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();
  return files.map((f) => {
    const raw = fs.readFileSync(path.join(CASES_DIR, f), "utf8");
    return parseYaml(raw) as EvalCase;
  });
}

function loadWorld(filename: string): WorldFixture {
  const filePath = path.join(WORLDS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`world fixture not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as WorldFixture;
}

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function defaultOutDir(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(DEFAULT_RUNS_DIR, stamp);
}

function printUsage(): void {
  console.log(`Usage: npm run eval -- [options]

Options:
  --list           List available cases
  --case <id>      Run a single case by id
  --all            Run all cases (default when no --case)
  --sample         Write sample traces (no API key; for viewer smoke test)
  --out <dir>      Output directory (default: runs/<ISO-timestamp>/)

Examples:
  ANTHROPIC_API_KEY=... npm run eval -- --all
  ANTHROPIC_API_KEY=... npm run eval -- --case sam-ambiguous
`);
}

function toViewerTrace(
  evalCase: EvalCase,
  world: WorldFixture,
  runId: string,
  trace: AgentTrace,
): EvalTrace {
  return {
    caseId: evalCase.id,
    description: evalCase.description,
    tags: evalCase.tags,
    ...(evalCase.notes ? { notes: evalCase.notes } : {}),
    runId,
    model: trace.model,
    startedAt: trace.startedAt,
    finishedAt: trace.finishedAt,
    latencyMs: trace.latencyMs,
    input: {
      worldFixtureId: world.id,
      history: evalCase.history,
      systemPromptBase: trace.systemPromptBase,
      contextBlock: trace.contextBlock,
    },
    rounds: trace.rounds.map((round) => ({
      round: round.round,
      latencyMs: round.latencyMs,
      usage: round.usage,
      toolUses: round.toolUses.map((tool) => ({
        id: tool.id,
        name: tool.name,
        input: tool.input,
      })),
      toolResults: round.toolResults.map((result) => ({
        id: result.tool_use_id,
        result: result.result,
        ...(result.is_error ? { error: result.content } : {}),
      })),
      text: round.text,
    })),
    output: trace.output,
  };
}

function updateRunsIndex(outDir: string, manifest: RunManifest): void {
  fs.mkdirSync(DEFAULT_RUNS_DIR, { recursive: true });

  let index: RunIndexEntry[] = [];
  if (fs.existsSync(RUNS_INDEX_FILE)) {
    try {
      index = JSON.parse(fs.readFileSync(RUNS_INDEX_FILE, "utf8")) as RunIndexEntry[];
    } catch {
      index = [];
    }
  }

  const runPath = path.relative(PKG_ROOT, outDir).split(path.sep).join("/");
  const entry: RunIndexEntry = {
    runId: manifest.runId,
    path: `/${runPath}`,
    startedAt: manifest.startedAt,
    caseCount: manifest.cases.length,
  };

  index = [entry, ...index.filter((item) => item.runId !== manifest.runId)];
  fs.writeFileSync(RUNS_INDEX_FILE, JSON.stringify(index, null, 2));
}

async function runCase(
  evalCase: EvalCase,
  outDir: string,
  runId: string,
  sample: boolean,
): Promise<{ traceFile: string; latencyMs: number }> {
  const world = loadWorld(evalCase.world);
  const contextBlock = renderContextBlock(world.snapshot);

  let trace: AgentTrace;
  if (sample) {
    const startedAt = new Date();
    trace = {
      systemPromptBase: SYSTEM_PROMPT_BASE,
      contextBlock,
      model: DEFAULT_MODEL,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date(startedAt.getTime() + 1200).toISOString(),
      latencyMs: 1200,
      rounds: [
        {
          round: 0,
          latencyMs: 420,
          usage: { input_tokens: 3100, output_tokens: 45 },
          toolUses: [
            {
              type: "tool_use",
              id: "toolu_sample_list_rels",
              name: "list_relationships",
              input: { target_type: "all" },
            },
          ],
          toolResults: [
            {
              type: "tool_result",
              tool_use_id: "toolu_sample_list_rels",
              content: JSON.stringify(world.toolData.relationships),
              result: world.toolData.relationships,
            },
          ],
          text: "",
        },
        {
          round: 1,
          latencyMs: 780,
          usage: { input_tokens: 3400, output_tokens: 92 },
          toolUses: [],
          toolResults: [],
          text:
            "You have two Sams in your world — Sam Patel at work and Sam O'Brien from college. Which one was last night?",
        },
      ],
      output: {
        text:
          "You have two Sams in your world — Sam Patel at work and Sam O'Brien from college. Which one was last night?",
        toolCalls: [
          {
            id: "toolu_sample_list_rels",
            name: "list_relationships",
            input: { target_type: "all" },
            result_preview: "[…]",
          },
        ],
      },
    };
  } else {
    ({ trace } = await runConversationalAgentTurn({
      history: evalCase.history,
      snapshot: world.snapshot,
      fixture: world.toolData,
    }));
  }

  const tracePayload = toViewerTrace(evalCase, world, runId, trace);

  const traceFile = `${evalCase.id}.trace.json`;
  fs.writeFileSync(
    path.join(outDir, traceFile),
    JSON.stringify(tracePayload, null, 2),
  );

  return { traceFile, latencyMs: trace.latencyMs };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    const cases = loadCases();
    console.log("Available cases:\n");
    for (const c of cases) {
      console.log(`  ${c.id}`);
      console.log(`    ${c.description}`);
      console.log(`    tags: ${c.tags.join(", ")}`);
      console.log(`    world: ${c.world}\n`);
    }
    return;
  }

  const allCases = loadCases();
  let selected: EvalCase[];

  if (args.sample) {
    selected = allCases;
  } else if (args.caseId) {
    selected = allCases.filter((c) => c.id === args.caseId);
    if (selected.length === 0) {
      console.error(`Unknown case: ${args.caseId}`);
      process.exit(1);
    }
  } else if (args.all || !args.caseId) {
    selected = allCases;
  } else {
    printUsage();
    process.exit(1);
  }

  const outDir = path.resolve(args.outDir ?? defaultOutDir());
  fs.mkdirSync(outDir, { recursive: true });

  const runStarted = new Date();
  const runId = path.basename(outDir);
  const manifest: RunManifest = {
    runId,
    startedAt: runStarted.toISOString(),
    finishedAt: "",
    gitSha: gitSha(),
    model: DEFAULT_MODEL,
    cases: [],
  };

  console.log(`Running ${selected.length} case(s) → ${outDir}\n`);

  for (const evalCase of selected) {
    process.stdout.write(`  ${evalCase.id} ... `);
    try {
      const { traceFile, latencyMs } = await runCase(
        evalCase,
        outDir,
        runId,
        args.sample,
      );
      manifest.cases.push({
        id: evalCase.id,
        description: evalCase.description,
        tags: evalCase.tags,
        traceFile,
        latencyMs,
        review: null,
      });
      console.log(`done (${latencyMs}ms)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`FAILED: ${message}`);
      process.exit(1);
    }
  }

  manifest.finishedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  updateRunsIndex(outDir, manifest);

  const totalMs = selected.reduce(
    (sum, c) =>
      sum +
      (manifest.cases.find((m) => m.id === c.id)?.latencyMs ?? 0),
    0,
  );

  console.log("\n--- Summary ---");
  console.log(`Run ID:    ${runId}`);
  console.log(`Output:    ${outDir}`);
  console.log(`Model:     ${manifest.model}`);
  console.log(`Git SHA:   ${manifest.gitSha}`);
  console.log(`Cases:     ${manifest.cases.length}`);
  console.log(`Total:     ${totalMs}ms`);
  for (const c of manifest.cases) {
    console.log(`  - ${c.id}: ${c.latencyMs}ms → ${c.traceFile}`);
  }
  console.log(`\nView traces: npm run eval:view`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
