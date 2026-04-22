import { runQualityChecks } from "@/lib/postprocess";
import {
  findTemplateTermById,
  findTemplateTermForNames
} from "@/lib/templateParser";
import type {
  GoldStandardDoc,
  GoldStandardEntry,
  GoldStandardImportDecision,
  GoldStandardImportIssue,
  GoldStandardImportRow,
  PendingGoldStandardImport,
  TemplateOutline
} from "@/lib/types";

const REQUIRED_COLUMNS = [
  "template_term_id",
  "chapter",
  "term_name_cn",
  "term_name_en",
  "source_doc",
  "source_excerpt",
  "standard_definition",
  "notes"
] as const;

function cleanText(input: string) {
  return input.replace(/\r/g, "").replace(/\u00a0/g, " ").trim();
}

function parseCsvText(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows
    .map((line) => line.map((cell) => cleanText(cell)))
    .filter((line) => line.some((cell) => cell.length > 0));
}

function escapeCsvCell(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

function parseRows(
  text: string,
  fileName: string,
  sourceKind: GoldStandardDoc["source_kind"]
) {
  const rows = parseCsvText(text);
  if (rows.length === 0) {
    throw new Error("CSV 为空。");
  }

  const header = rows[0];
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !header.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`CSV 缺少必要列：${missingColumns.join("、")}`);
  }

  const columnIndex = new Map(header.map((column, index) => [column, index]));
  const uploadedAt = new Date().toISOString();
  const goldStandardDoc: GoldStandardDoc = {
    id: crypto.randomUUID(),
    file_name: fileName,
    uploaded_at: uploadedAt,
    source_kind: sourceKind
  };

  const parsedRows: GoldStandardImportRow[] = rows.slice(1).map((line, index) => {
    const get = (column: (typeof REQUIRED_COLUMNS)[number]) =>
      cleanText(line[columnIndex.get(column) ?? -1] ?? "");
    return {
      row_id: `GS${String(index + 1).padStart(3, "0")}`,
      row_index: index + 2,
      template_term_id: get("template_term_id") || undefined,
      chapter: get("chapter"),
      term_name_cn: get("term_name_cn"),
      term_name_en: get("term_name_en"),
      source_doc: get("source_doc"),
      source_excerpt: get("source_excerpt"),
      standard_definition: get("standard_definition"),
      notes: get("notes")
    };
  });

  return { goldStandardDoc, parsedRows };
}

function buildIssue(params: Omit<GoldStandardImportIssue, "status">): GoldStandardImportIssue {
  return {
    ...params,
    status: "pending"
  };
}

function buildIssuesForRows(rows: GoldStandardImportRow[], templateOutline: TemplateOutline) {
  return rows.flatMap((row) => {
    if (row.template_term_id) {
      const byId = findTemplateTermById(templateOutline, row.template_term_id);
      if (byId) {
        return [];
      }

      const suggested = findTemplateTermForNames(templateOutline, [
        row.term_name_cn,
        row.term_name_en
      ]);
      return [
        buildIssue({
          issue_id: `gs:${row.row_id}`,
          row_id: row.row_id,
          row_index: row.row_index,
          issue_type: "invalid_template_term_id",
          raw_template_term_id: row.template_term_id,
          raw_term_name_cn: row.term_name_cn,
          raw_term_name_en: row.term_name_en,
          suggested_template_term_id: suggested?.template_term_id,
          suggested_term_name_cn: suggested?.name_cn,
          reason: suggested
            ? `CSV 中的 template_term_id 无效，但术语名可映射到模板词“${suggested.name_cn}”。`
            : "CSV 中的 template_term_id 无效，且无法从术语名自动定位模板词。",
          blocking: true
        })
      ];
    }

    const suggested = findTemplateTermForNames(templateOutline, [
      row.term_name_cn,
      row.term_name_en
    ]);
    if (suggested) {
      return [
        buildIssue({
          issue_id: `gs:${row.row_id}`,
          row_id: row.row_id,
          row_index: row.row_index,
          issue_type: "name_match_review",
          raw_term_name_cn: row.term_name_cn,
          raw_term_name_en: row.term_name_en,
          suggested_template_term_id: suggested.template_term_id,
          suggested_term_name_cn: suggested.name_cn,
          reason: `CSV 未提供 template_term_id，术语名可唯一映射到模板词“${suggested.name_cn}”，需人工确认后导入。`,
          blocking: false
        })
      ];
    }

    return [
      buildIssue({
        issue_id: `gs:${row.row_id}`,
        row_id: row.row_id,
        row_index: row.row_index,
        issue_type: row.term_name_cn ? "unmatched_template_term" : "missing_template_term_id",
        raw_term_name_cn: row.term_name_cn,
        raw_term_name_en: row.term_name_en,
        reason: row.term_name_cn
          ? "CSV 未提供 template_term_id，且术语名无法匹配到模板词。"
          : "CSV 缺少 template_term_id 与术语名，无法导入。",
        blocking: true
      })
    ];
  });
}

function resolveIssueTemplateTermId(
  issue: GoldStandardImportIssue,
  decision: GoldStandardImportDecision | undefined
) {
  if (!decision) {
    return undefined;
  }
  if (decision.action === "drop_row") {
    return null;
  }
  if (decision.action === "manual_map") {
    return decision.manual_template_term_id?.trim() || undefined;
  }
  return issue.suggested_template_term_id;
}

function buildEntry(
  row: GoldStandardImportRow,
  templateOutline: TemplateOutline,
  templateTermId: string,
  importedAt: string
): GoldStandardEntry {
  const templateTerm = findTemplateTermById(templateOutline, templateTermId);
  if (!templateTerm) {
    throw new Error(`模板中不存在 template_term_id=${templateTermId}`);
  }

  return {
    template_term_id: templateTerm.template_term_id,
    chapter: templateTerm.chapter,
    term_name_cn: templateTerm.name_cn,
    term_name_en: templateTerm.name_en,
    source_doc: row.source_doc,
    source_excerpt: row.source_excerpt,
    standard_definition: row.standard_definition,
    notes: row.notes || undefined,
    quality_flags: runQualityChecks({
      termNameCn: templateTerm.name_cn,
      termNameEn: templateTerm.name_en,
      mergedDefinition: row.standard_definition
    }),
    imported_at: importedAt
  };
}

export interface PendingGoldStandardImportResolution {
  issues: GoldStandardImportIssue[];
  entries: GoldStandardEntry[];
  can_commit: boolean;
  dropped_count: number;
}

export interface CliGoldStandardImportResult extends PendingGoldStandardImportResolution {
  blocking_issues: GoldStandardImportIssue[];
  decisions: Record<string, GoldStandardImportDecision>;
}

export function resolvePendingGoldStandardImport(
  pendingImport: PendingGoldStandardImport,
  decisions: Record<string, GoldStandardImportDecision>,
  templateOutline: TemplateOutline
): PendingGoldStandardImportResolution {
  const issuesByRowId = new Map(
    pendingImport.issues.map((issue) => [issue.row_id, issue])
  );
  const importedAt = new Date().toISOString();
  const entries: GoldStandardEntry[] = [];
  let droppedCount = 0;

  const resolvedIssues = pendingImport.issues.map((issue) => {
    const decision = decisions[issue.issue_id];
    if (!decision) {
      return issue;
    }
    return {
      ...issue,
      status: "resolved" as const
    };
  });

  pendingImport.rows.forEach((row) => {
    const issue = issuesByRowId.get(row.row_id);
    if (!issue) {
      if (!row.template_term_id) {
        return;
      }
      entries.push(buildEntry(row, templateOutline, row.template_term_id, importedAt));
      return;
    }

    const decision = decisions[issue.issue_id];
    if (!decision) {
      return;
    }
    const resolved = resolveIssueTemplateTermId(issue, decision);
    if (resolved === null) {
      droppedCount += 1;
      return;
    }
    if (!resolved) {
      return;
    }
    entries.push(buildEntry(row, templateOutline, resolved, importedAt));
  });

  return {
    issues: resolvedIssues,
    entries,
    can_commit: resolvedIssues.every((issue) => issue.status === "resolved"),
    dropped_count: droppedCount
  };
}

export async function buildPendingGoldStandardImport(
  file: File,
  templateOutline: TemplateOutline
): Promise<PendingGoldStandardImport> {
  const text = await file.text();
  return buildPendingGoldStandardImportFromText({
    text,
    fileName: file.name,
    templateOutline,
    sourceKind: "csv"
  });
}

export function buildPendingGoldStandardImportFromText(params: {
  text: string;
  fileName: string;
  templateOutline: TemplateOutline;
  sourceKind?: GoldStandardDoc["source_kind"];
}) {
  const { text, fileName, templateOutline, sourceKind = "csv" } = params;
  const { goldStandardDoc, parsedRows } = parseRows(text, fileName, sourceKind);
  return {
    import_id: crypto.randomUUID(),
    gold_standard_doc: goldStandardDoc,
    rows: parsedRows,
    issues: buildIssuesForRows(parsedRows, templateOutline)
  } satisfies PendingGoldStandardImport;
}

export function autoResolvePendingGoldStandardImportForCli(
  pendingImport: PendingGoldStandardImport,
  templateOutline: TemplateOutline
): CliGoldStandardImportResult {
  const decisions: Record<string, GoldStandardImportDecision> = {};
  pendingImport.issues.forEach((issue) => {
    if (issue.suggested_template_term_id) {
      decisions[issue.issue_id] = {
        issue_id: issue.issue_id,
        action: "accept_suggestion"
      };
    }
  });

  const resolution = resolvePendingGoldStandardImport(pendingImport, decisions, templateOutline);
  return {
    ...resolution,
    decisions,
    blocking_issues: resolution.issues.filter((issue) => issue.status !== "resolved")
  };
}

export function serializeGoldStandardCsv(entries: GoldStandardEntry[]) {
  const header = REQUIRED_COLUMNS.join(",");
  const lines = entries.map((entry) =>
    [
      entry.template_term_id,
      entry.chapter,
      entry.term_name_cn,
      entry.term_name_en,
      entry.source_doc,
      entry.source_excerpt,
      entry.standard_definition,
      entry.notes ?? ""
    ]
      .map((cell) => escapeCsvCell(cell))
      .join(",")
  );
  return [header, ...lines].join("\n");
}
