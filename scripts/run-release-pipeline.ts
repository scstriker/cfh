import fs from "node:fs/promises";
import path from "node:path";
import { JSDOM } from "jsdom";
import { buildPreclusters } from "@/lib/precluster";
import { runMergePipeline, type MergeProgressEvent } from "@/lib/merger";
import { buildGbDocxBuffer } from "@/lib/exporter";
import { autoResolvePendingImportBatchForCli } from "@/lib/draftImport";
import {
  autoResolvePendingGoldStandardImportForCli,
  buildPendingGoldStandardImportFromText
} from "@/lib/goldStandard";
import { normalizeTemplateLookup, parseTemplateDocx } from "@/lib/templateParser";
import type {
  ConceptCluster,
  DraftCleaningIssue,
  GoldStandardImportIssue,
  ReviewDecision,
  TemplateOutline
} from "@/lib/types";

type CliOptions = {
  inputDir: string;
  outputPath: string;
  templatePath: string;
  goldStandardCsvPath: string;
  primaryAuthor: string;
  apiKeyEnv: string;
  apiKey?: string;
  apiKeyFile?: string;
  help: boolean;
};

function printHelp() {
  console.log(`CFH Release Pipeline

Usage:
  npm run pipeline:release -- --template-path <path> --input-dir <path> --output-path <path> [options]

Required:
  --template-path <path>    Template DOCX path
  --input-dir <path>        Expert DOCX directory
  --output-path <path>      Output .docx file path

Optional:
  --gold-standard-csv <path>  Gold standard CSV path

Deprecated:
  --primary-author <name>   Ignored in V3; retained only for backward compatibility

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
    outputPath: "",
    templatePath: "",
    goldStandardCsvPath: "",
    primaryAuthor: "",
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
    if (arg === "--template-path" || arg === "-t") {
      options.templatePath = next ?? "";
      i += 1;
      continue;
    }
    if (arg === "--input-dir" || arg === "-i") {
      options.inputDir = next ?? "";
      i += 1;
      continue;
    }
    if (arg === "--gold-standard-csv" || arg === "-g") {
      options.goldStandardCsvPath = next ?? "";
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

async function readDocxAsFile(absPath: string) {
  const buf = await fs.readFile(absPath);
  return {
    name: path.basename(absPath),
    arrayBuffer: async () =>
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  } as unknown as File;
}

function buildClustersFromPrecluster(
  precluster: ReturnType<typeof buildPreclusters>,
  templateOutline: TemplateOutline,
  goldStandardTemplateIds: Set<string>
) {
  const termMap = new Map(precluster.terms.map((term) => [term.term_key, term]));
  const clusters: ConceptCluster[] = [];
  const matchedTemplateIds = new Set<string>();

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

    const candidateNames = [
      aliases[0] ?? members[0].term_name,
      ...(aliases ?? []),
      firstTerm?.name_en ?? ""
    ]
      .map((value) => normalizeTemplateLookup(value))
      .filter(Boolean);
    const matchedTemplate = templateOutline.terms.find((term) => {
      const cn = normalizeTemplateLookup(term.name_cn);
      const en = normalizeTemplateLookup(term.name_en);
      return candidateNames.some((name) => name === cn || (en && name === en));
    });

    if (matchedTemplate) {
      matchedTemplateIds.add(matchedTemplate.template_term_id);
    }

    clusters.push({
      cluster_id: `C${String(index + 1).padStart(3, "0")}`,
      canonical_name_cn: matchedTemplate?.name_cn ?? aliases[0] ?? members[0].term_name,
      canonical_name_en: matchedTemplate?.name_en ?? firstTerm?.name_en ?? "",
      members,
      aliases,
      is_orphan: !matchedTemplate && members.length === 1,
      in_template_scope: Boolean(matchedTemplate),
      template_term_id: matchedTemplate?.template_term_id,
      gold_standard_term: matchedTemplate
        ? goldStandardTemplateIds.has(matchedTemplate.template_term_id)
        : false,
      mapping_type: "related",
      include_in_scope: true,
      suggested_chapter: matchedTemplate?.chapter ?? firstTerm?.chapter ?? ""
    });
  });

  templateOutline.terms
    .filter((term) => !matchedTemplateIds.has(term.template_term_id))
    .forEach((term, index) => {
      clusters.push({
        cluster_id: `TM${String(index + 1).padStart(3, "0")}`,
        canonical_name_cn: term.name_cn,
        canonical_name_en: term.name_en,
        members: [],
        aliases: [],
        is_orphan: false,
        in_template_scope: true,
        template_term_id: term.template_term_id,
        gold_standard_term: goldStandardTemplateIds.has(term.template_term_id),
        mapping_type: undefined,
        include_in_scope: true,
        suggested_chapter: term.chapter
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
      decision:
        result.definition_source === "gold_standard" ? "accept_gold_standard" : "accept_merge",
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

function printCleaningSummary(
  summary: Awaited<ReturnType<typeof autoResolvePendingImportBatchForCli>>["summary"]
) {
  console.log(
    `[PIPELINE] cleaning docs=${summary.doc_count}, terms=${summary.term_count}, issues=${summary.issue_count}, blocking=${summary.blocking_issue_count}`
  );
  Object.entries(summary.issue_counts).forEach(([issueType, count]) => {
    if (count > 0) {
      console.log(`[PIPELINE] cleaning ${issueType}=${count}`);
    }
  });
  summary.accepted_samples.forEach((sample) => {
    console.log(
      `[PIPELINE] cleaning sample ${sample.author}: ${sample.raw_name_cn} -> ${sample.cleaned_name_cn}`
    );
  });
}

function formatBlockingIssue(issue: DraftCleaningIssue) {
  return `${issue.author}/${issue.file_name}/${issue.raw_term_id} ${issue.issue_type}: ${issue.raw_name_cn} | ${issue.reason}`;
}

function formatGoldBlockingIssue(issue: GoldStandardImportIssue) {
  return `row=${issue.row_index} ${issue.issue_type}: ${issue.raw_term_name_cn || "（空）"} | ${issue.reason}`;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.templatePath || !options.inputDir || !options.outputPath) {
    printHelp();
    throw new Error("Missing required args: --template-path, --input-dir, --output-path");
  }

  if (options.primaryAuthor) {
    console.warn("[PIPELINE] --primary-author 已废弃，在 V3 中不再参与逻辑。");
  }

  const apiKey = await resolveApiKey(options);
  if (!apiKey) {
    throw new Error(
      `Missing Gemini API key. Provide --api-key / --api-key-file or set ${options.apiKeyEnv}.`
    );
  }

  ensureDomParser();

  const inputDir = path.resolve(options.inputDir);
  const templatePath = path.resolve(options.templatePath);
  const outputPath = path.resolve(options.outputPath);
  const fileNames = (await fs.readdir(inputDir))
    .filter((name) => name.endsWith(".docx"))
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));

  if (fileNames.length === 0) {
    throw new Error(`No .docx files found in ${inputDir}`);
  }

  const templateFile = await readDocxAsFile(templatePath);
  const { templateOutline } = await parseTemplateDocx(templateFile);
  let goldStandardEntries: Awaited<
    ReturnType<typeof autoResolvePendingGoldStandardImportForCli>
  >["entries"] = [];

  console.log(
    `[PIPELINE] template chapters=${templateOutline.chapter_order.length}, terms=${templateOutline.terms.length}`
  );
  console.log(`[PIPELINE] input docs=${fileNames.length}`);

  if (options.goldStandardCsvPath) {
    const goldCsvPath = path.resolve(options.goldStandardCsvPath);
    const goldCsvText = await fs.readFile(goldCsvPath, "utf-8");
    const pendingGoldImport = buildPendingGoldStandardImportFromText({
      text: goldCsvText,
      fileName: path.basename(goldCsvPath),
      templateOutline
    });
    const goldImportResult = autoResolvePendingGoldStandardImportForCli(
      pendingGoldImport,
      templateOutline
    );
    goldStandardEntries = goldImportResult.entries;
    console.log(
      `[PIPELINE] gold entries=${goldImportResult.entries.length}, issues=${goldImportResult.issues.length}, blocking=${goldImportResult.blocking_issues.length}`
    );
    if (goldImportResult.blocking_issues.length > 0) {
      goldImportResult.blocking_issues.forEach((issue) => {
        console.error(`[PIPELINE] gold blocked ${formatGoldBlockingIssue(issue)}`);
      });
      throw new Error("Gold standard CSV produced unresolved issues. Resolve them in Phase 1 first.");
    }
  }

  const inputFiles: File[] = [];
  for (const fileName of fileNames) {
    const file = await readDocxAsFile(path.join(inputDir, fileName));
    inputFiles.push(file);
  }

  const importResult = await autoResolvePendingImportBatchForCli(inputFiles, templateOutline);
  printCleaningSummary(importResult.summary);
  if (importResult.blocking_issues.length > 0) {
    importResult.blocking_issues.forEach((issue) => {
      console.error(`[PIPELINE] cleaning blocked ${formatBlockingIssue(issue)}`);
    });
    throw new Error("Draft cleaning produced blocking issues. Resolve them in Phase 1 first.");
  }
  const parsedDocs = importResult.cleaned_docs;

  const precluster = buildPreclusters(parsedDocs);
  const conceptClusters = buildClustersFromPrecluster(
    precluster,
    templateOutline,
    new Set(goldStandardEntries.map((entry) => entry.template_term_id))
  );
  if (conceptClusters.length === 0) {
    throw new Error("No concept clusters generated from precluster.");
  }

  console.log(
    `[PIPELINE] terms=${precluster.stats.term_count}, groups=${precluster.stats.group_count}, clusters=${conceptClusters.length}`
  );

  const mergeResults = await runMergePipeline({
    apiKey,
    parsedDocs,
    templateOutline,
    conceptClusters,
    goldStandardEntries,
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
    decisions,
    templateOutline
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, docBuffer);

  const success = results.filter((item) => item.status !== "ai_failed").length;
  const failed = results.filter((item) => item.status === "ai_failed").length;
  const empty = results.filter((item) => !item.merged_definition.trim()).length;

  console.log(`[PIPELINE] merge success=${success}, failed=${failed}, empty=${empty}`);
  console.log(`[PIPELINE] written=${outputPath}`);
}

run().catch((error) => {
  console.error("[PIPELINE] failed", error);
  process.exitCode = 1;
});
