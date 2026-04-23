"use client";

import { useEffect } from "react";

export default function Phase0RedirectPage() {
  useEffect(() => {
    window.location.replace("/phase1#term-unit-review");
  }, []);

  return (
    <div className="space-y-3 rounded-xl bg-cfh-panel p-6 shadow-panel">
      <h1 className="text-lg font-semibold text-cfh-ink">阶段零已并入阶段一</h1>
      <p className="text-sm text-cfh-muted">
        系统会在阶段一自动生成术语工作单元。正在跳转到阶段一的“术语工作单元检查”区域。
      </p>
    </div>
  );
}
