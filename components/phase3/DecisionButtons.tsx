"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface SourceOption {
  author: string;
  text: string;
}

interface DecisionButtonsProps {
  acceptLabel?: string;
  mergedText: string;
  sourceOptions: SourceOption[];
  onAcceptMerge: () => void;
  onAcceptSourceOriginal: (author: string) => void;
  onDefer: () => void;
  onManualSave: (text: string) => void;
  showSourceOriginalAction?: boolean;
}

export function DecisionButtons({
  acceptLabel = "采纳合并稿",
  mergedText,
  sourceOptions,
  onAcceptMerge,
  onAcceptSourceOriginal,
  onDefer,
  onManualSave,
  showSourceOriginalAction = true
}: DecisionButtonsProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [selectedSourceAuthor, setSelectedSourceAuthor] = useState(sourceOptions[0]?.author ?? "");

  useEffect(() => {
    if (sourceOptions.some((option) => option.author === selectedSourceAuthor)) {
      return;
    }
    setSelectedSourceAuthor(sourceOptions[0]?.author ?? "");
  }, [selectedSourceAuthor, sourceOptions]);

  const initialDraft = useMemo(
    () => mergedText || sourceOptions[0]?.text || "",
    [mergedText, sourceOptions]
  );

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onAcceptMerge} type="button">
          {acceptLabel}
        </Button>
        {showSourceOriginalAction ? (
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-cfh-ink"
              onChange={(event) => setSelectedSourceAuthor(event.target.value)}
              value={selectedSourceAuthor}
            >
              {sourceOptions.length === 0 ? (
                <option value="">无可采纳原文</option>
              ) : (
                sourceOptions.map((option) => (
                  <option key={option.author} value={option.author}>
                    {option.author}
                  </option>
                ))
              )}
            </select>
            <Button
              disabled={!selectedSourceAuthor}
              onClick={() => onAcceptSourceOriginal(selectedSourceAuthor)}
              type="button"
              variant="secondary"
            >
              采纳指定专家原文
            </Button>
          </div>
        ) : null}
        <Button
          onClick={() => {
            setDraft(initialDraft);
            setOpen(true);
          }}
          type="button"
          variant="secondary"
        >
          手动编辑
        </Button>
        <Button onClick={onDefer} type="button" variant="ghost">
          标记待议
        </Button>
      </div>

      <Modal onClose={() => setOpen(false)} open={open} title="手动编辑术语定义">
        <div className="space-y-3">
          <p className="text-xs text-cfh-muted">
            MVP 实现采用文本编辑器；后续可扩展为富文本编辑。
          </p>
          <textarea
            className="h-48 w-full rounded-md border border-slate-200 p-2 text-sm text-cfh-ink outline-none ring-cfh-accent focus:ring-2"
            onChange={(event) => setDraft(event.target.value)}
            value={draft}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)} type="button" variant="ghost">
              取消
            </Button>
            <Button
              onClick={() => {
                onManualSave(draft.trim());
                setOpen(false);
              }}
              type="button"
            >
              保存编辑
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
