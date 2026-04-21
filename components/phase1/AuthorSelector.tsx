"use client";

import type { ParsedDoc } from "@/lib/types";
import { Card } from "@/components/ui/Card";

interface AuthorSelectorProps {
  docs: ParsedDoc[];
  selectedAuthors: string[];
  primaryAuthor: string;
  onToggleAuthor: (author: string) => void;
  onPrimaryAuthorChange: (author: string) => void;
}

export function AuthorSelector({
  docs,
  selectedAuthors,
  primaryAuthor,
  onToggleAuthor,
  onPrimaryAuthorChange
}: AuthorSelectorProps) {
  return (
    <Card title="专家选择与主稿设置">
      <div className="space-y-3">
        {docs.map((doc) => {
          const selected = selectedAuthors.includes(doc.author);
          return (
            <div
              key={doc.id}
              className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[1fr_140px]"
            >
              <label className="inline-flex items-center gap-2 text-sm text-cfh-ink">
                <input
                  checked={selected}
                  onChange={() => onToggleAuthor(doc.author)}
                  type="checkbox"
                />
                {doc.author}（{doc.file_name}）
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-cfh-muted">
                <input
                  checked={primaryAuthor === doc.author}
                  disabled={!selected}
                  name="primary-author"
                  onChange={() => onPrimaryAuthorChange(doc.author)}
                  type="radio"
                />
                主稿
              </label>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
