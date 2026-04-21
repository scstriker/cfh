import fs from "node:fs/promises";
import path from "node:path";
import { JSDOM } from "jsdom";
import { parseDocx } from "@/lib/parser";
import { buildPreclusters } from "@/lib/precluster";
import { runMergePipeline, type MergeProgressEvent } from "@/lib/merger";
import { buildGbDocxBuffer } from "@/lib/exporter";
import type { ConceptCluster, ReviewDecision } from "@/lib/types";

type CliOptions = {
  inputDir: string;
  primaryAuthor: string;
  outputPath: string;
  apiKeyEnv: string;
  apiKey?: string;
  apiKeyFile?: string;
  help: boolean;
};

function printHelp() {
  console.log(`CFH Release Pipeline

Usage:
  npm run pipeline:release -- --input-dir <path> --primary-author <name> --output-path <path> [options]

Required:
  --input-dir <path>        Source DOCX directory
  --primary-author <name>   Primary manuscript author
  --output-path <path>      Output .docx file path

API key source options (choose one):
  --api-key <key>           Pass key directly (not recommended for shell history)
  --api-key-file <path>     Read key from file (plain text)
  --api-key-env <name>      Read key from environment variable (default: GEMINI_API_KEY)

Other:
  --help                    Show this help
`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputDir: "",
    primaryAuthor: "",
    outputPath: "",
    apiKeyEnv: "GEMINI_API_KEY",
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--input-dir" || arg === "-i") {
      options.inputDir = next ?? "";
      i += 1;
      continue;
    }
    if (arg === "--primary-author" || arg === "-p") {
      options.primaryAuthor = next ?? "";
      i += 1;
      continue;
    }
    if (arg === "--output-path" || arg === "-o") {
      options.outputPath = next ?? "";
      i += 1;
      continue;
    }
    if (arg === "--api-key-env") {
      options.apiKeyEnv = next ?? "GEMINI_API_KEY";
      i += 1;
      continue;
    }
    if (arg === "--api-key") {
      options.apiKey = next ?? "";
      i += 1;
      continue;
    }
    if (arg === "--api-key-file") {
      options.apiKeyFile = next ?? "";
      i += 1;
      continue;
    }
  }

  return options;
}

async function resolveApiKey(options: CliOptions) {
  if (options.apiKey && options.apiKey.trim()) {
    return options.apiKey.trim();
  }
  if (options.apiKeyFile && options.apiKeyFile.trim()) {
    const raw = await fs.readFile(options.apiKeyFile, "utf-8");
    return raw.trim();
  }
  return (process.env[options.apiKeyEnv] ?? "").trim();
}

function ensureDomParser() {
  if (typeof DOMParser !== "undefined") {
    return;
  }
  const dom = new JSDOM("");
  Reflect.set(globalThis as object, "DOMParser", dom.window.DOMParser);
}

function buildClustersFromPrecluster(precluster: ReturnType<typeof buildPreclusters>) {
  const termMap = new Map(precluster.terms.map((term) => [term.term_key, term]));
  const clusters: ConceptCluster[] = [];

  precluster.groups.forEach((group, index) => {
    const members = group.member_keys
      .map((key) => termMap.get(key))
      .filter((term): term is NonNullable<typeof term> => Boolean(term))
      .map((term) => ({
        author: term.author,
        term_id: term.term_id,
        term_name: term.name_cn
      }));

    if (members.length === 0) {
      return;
    }

    const firstTerm = termMap.get(group.member_keys[0]);
    const aliases =
      group.aliases.length > 0
        ? group.aliases
        : Array.from(new Set(members.map((member) => member.term_name)));

    clusters.push({
      cluster_id: `C${String(index + 1).padStart(3, "0")}`,
      canonical_name_cn: aliases[0] ?? members[0].term_name,
      canonical_name_en: firstTerm?.name_en ?? "",
      members,
      aliases,
      is_orphan: members.length === 1,
      mapping_type: "related",
      include_in_scope: true,
      suggested_chapter: firstTerm?.chapter ?? ""
    });
  });

  return clusters;
}

function buildAcceptAllDecisions(
  mergeResults: Awaited<ReturnType<typeof runMergePipeline>>
): Record<string, ReviewDecision> {
  const decisions: Record<string, ReviewDecision> = {};
  const timestamp = new Date().toISOString();

  Object.values(mergeResults).forEach((result) => {
    decisions[result.cluster_id] = {
      cluster_id: result.cluster_id,
      decision: "accept_merge",
      final_text: result.merged_definition,
      final_segments: result.segments,
      timestamp
    };
  });

  return decisions;
}

function printProgress(event: MergeProgressEvent) {
  const base = `[${event.completed}/${event.total}] ${event.term_name_cn}`;
  if (event.status === "success") {
    console.log(`${base} ✅ ${event.message}`);
  } else if (event.status === "failed") {
    console.log(`${base} ❌ ${event.message}`);
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.inputDir || !options.primaryAuthor || !options.outputPath) {
    printHelp();
    throw new Error("Missing required args: --input-dir, --primary-author, --output-path");
  }

  const apiKey = await resolveApiKey(options);
  if (!apiKey) {
    throw new Error(
      `Missing Gemini API key. Provide --api-key / --api-key-file or set ${options.apiKeyEnv}.`
    );
  }

  ensureDomParser();

  const inputDir = path.resolve(options.inputDir);
  const outputPath = path.resolve(options.outputPath);
  const fileNames = (await fs.readdir(inputDir))
    .filter((name) => name.endsWith(".docx"))
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));

  if (fileNames.length === 0) {
    throw new Error(`No .docx files found in ${inputDir}`);
  }

  console.log(`[PIPELINE] input docs=${fileNames.length}`);
  const parsedDocs = [] as Awaited<ReturnType<typeof parseDocx>>[];
  for (const fileName of fileNames) {
    const abs = path.join(inputDir, fileName);
    const buf = await fs.readFile(abs);
    const file = {
      name: fileName,
      arrayBuffer: async () =>
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    } as unknown as File;
    parsedDocs.push(await parseDocx(file));
  }

  const precluster = buildPreclusters(parsedDocs);
  const conceptClusters = buildClustersFromPrecluster(precluster);
  if (conceptClusters.length === 0) {
    throw new Error("No concept clusters generated from precluster.");
  }

  console.log(
    `[PIPELINE] terms=${precluster.stats.term_count}, groups=${precluster.stats.group_count}, clusters=${conceptClusters.length}`
  );

  const mergeResults = await runMergePipeline({
    apiKey,
    parsedDocs,
    conceptClusters,
    primaryAuthor: options.primaryAuthor,
    model: "gemini-3.1-pro-preview",
    intervalMs: 200,
    maxAttempts: 3,
    retryBaseMs: 800,
    onProgress: printProgress
  });

  const results = Object.values(mergeResults);
  const decisions = buildAcceptAllDecisions(mergeResults);
  const docBuffer = await buildGbDocxBuffer({
    results,
    decisions
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, docBuffer);

  const success = results.filter((item) => item.status !== "ai_failed").length;
  const failed = results.filter((item) => item.status === "ai_failed").length;
  const empty = results.filter((item) => !item.merged_definition.trim()).length;

  console.log(`[PIPELINE] merge success=${success}, failed=${failed}, empty=${empty}`);
  console.log(`[PIPELINE] output=${outputPath}`);
}

run().catch((error) => {
  console.error("[PIPELINE] failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
