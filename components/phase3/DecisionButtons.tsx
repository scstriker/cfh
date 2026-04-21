"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface DecisionButtonsProps {
  mergedText: string;
  primaryText: string;
  canUsePrimary: boolean;
  onAcceptMerge: () => void;
  onAcceptPrimary: () => void;
  onDefer: () => void;
  onManualSave: (text: string) => void;
}

export function DecisionButtons({
  mergedText,
  primaryText,
  canUsePrimary,
  onAcceptMerge,
  onAcceptPrimary,
  onDefer,
  onManualSave
}: DecisionButtonsProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const initialDraft = useMemo(() => mergedText || primaryText || "", [mergedText, primaryText]);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onAcceptMerge} type="button">
          采纳合并稿
        </Button>
        <Button disabled={!canUsePrimary} onClick={onAcceptPrimary} type="button" variant="secondary">
          采纳主稿原文
        </Button>
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
