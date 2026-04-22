"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface FileUploaderProps {
  accept?: string;
  disabled?: boolean;
  description?: string;
  filterFiles?: (files: File[]) => File[];
  multiple?: boolean;
  title?: string;
  onFilesSelected: (files: File[]) => void;
}

function filterDocx(files: File[]) {
  return files.filter((file) => file.name.toLowerCase().endsWith(".docx"));
}

export function FileUploader({
  accept = ".docx",
  disabled = false,
  description = "拖拽 `.docx` 文件到此处，或点击按钮选择文件（支持多选）。",
  filterFiles = filterDocx,
  multiple = true,
  title = "上传 DOCX 草案",
  onFilesSelected
}: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handlePick = (files: FileList | null) => {
    if (!files) {
      return;
    }
    const pickedFiles = filterFiles(Array.from(files));
    if (pickedFiles.length > 0) {
      onFilesSelected(pickedFiles);
    }
  };

  return (
    <Card title={title}>
      <div
        className={[
          "rounded-lg border border-dashed p-6 text-center transition",
          dragging ? "border-cfh-accent bg-cfh-bg" : "border-slate-300 bg-white",
          disabled ? "pointer-events-none opacity-50" : ""
        ].join(" ")}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handlePick(event.dataTransfer.files);
        }}
      >
        <p className="mb-3 text-sm text-cfh-muted">{description}</p>
        <Button onClick={() => inputRef.current?.click()} type="button" variant="secondary">
          选择文件
        </Button>
        <input
          ref={inputRef}
          accept={accept}
          className="hidden"
          multiple={multiple}
          onChange={(event) => handlePick(event.target.files)}
          type="file"
        />
      </div>
    </Card>
  );
}
