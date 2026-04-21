"use client";

import type { PropsWithChildren } from "react";
import { Button } from "@/components/ui/Button";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
}

export function Modal({ children, open, title, onClose }: PropsWithChildren<ModalProps>) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-cfh-panel p-4 shadow-panel">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-cfh-ink">{title}</h2>
          <Button onClick={onClose} variant="ghost">
            关闭
          </Button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
