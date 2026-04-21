"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthorSelector } from "@/components/phase1/AuthorSelector";
import { CoverageMatrix } from "@/components/phase1/CoverageMatrix";
import { FileUploader } from "@/components/phase1/FileUploader";
import { ParsePreview } from "@/components/phase1/ParsePreview";
import { Card } from "@/components/ui/Card";
import { parseDocx } from "@/lib/parser";
import type { ParsedDoc } from "@/lib/types";
import { useAppContext } from "@/store/AppContext";

export default function Phase1Page() {
  const { state, dispatch } = useAppContext();
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);

  useEffect(() => {
    const authors = state.parsed_docs.map((doc) => doc.author);
    const uniqueAuthors = Array.from(new Set(authors));
    setSelectedAuthors(uniqueAuthors);
    if (!uniqueAuthors.includes(state.primary_author)) {
      dispatch({
        type: "SET_PRIMARY_AUTHOR",
        payload: uniqueAuthors[0] ?? ""
      });
    }
  }, [state.parsed_docs, state.primary_author, dispatch]);

  const visibleDocs = useMemo(
    () => state.parsed_docs.filter((doc) => selectedAuthors.includes(doc.author)),
    [state.parsed_docs, selectedAuthors]
  );

  const handleFilesSelected = async (files: File[]) => {
    setParseError("");
    setIsParsing(true);

    try {
      const parsed = await Promise.all(files.map((file) => parseDocx(file)));
      const mergedMap = new Map<string, ParsedDoc>();
      [...state.parsed_docs, ...parsed].forEach((doc) => {
        mergedMap.set(doc.file_name, doc);
      });
      dispatch({
        type: "SET_PARSED_DOCS",
        payload: Array.from(mergedMap.values())
      });
    } catch (error) {
      console.error(error);
      setParseError("解析失败，请检查 DOCX 文件结构后重试。");
    } finally {
      setIsParsing(false);
    }
  };

  const toggleAuthor = (author: string) => {
    setSelectedAuthors((prev) => {
      if (prev.includes(author)) {
        return prev.filter((item) => item !== author);
      }
      return [...prev, author];
    });
  };

  return (
    <div className="space-y-4">
      <FileUploader disabled={isParsing} onFilesSelected={handleFilesSelected} />

      {isParsing ? (
        <Card>
          <p className="text-sm text-cfh-muted">正在解析文档，请稍候...</p>
        </Card>
      ) : null}

      {parseError ? (
        <Card>
          <p className="text-sm text-rose-600">{parseError}</p>
        </Card>
      ) : null}

      <AuthorSelector
        docs={state.parsed_docs}
        onPrimaryAuthorChange={(author) =>
          dispatch({ type: "SET_PRIMARY_AUTHOR", payload: author })
        }
        onToggleAuthor={toggleAuthor}
        primaryAuthor={state.primary_author}
        selectedAuthors={selectedAuthors}
      />

      <Card>
        <p className="text-sm text-cfh-muted">
          当前主稿作者：
          <span className="font-medium text-cfh-ink">
            {state.primary_author || "未选择"}
          </span>
        </p>
      </Card>

      <ParsePreview docs={visibleDocs} />
      <CoverageMatrix docs={visibleDocs} conceptClusters={state.concept_clusters} />
    </div>
  );
}
