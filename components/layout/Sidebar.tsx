"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "首页" },
  { href: "/phase0", label: "阶段零：概念对齐" },
  { href: "/phase1", label: "阶段一：文档解析" },
  { href: "/phase2", label: "阶段二：AI 合并" },
  { href: "/phase3", label: "阶段三：卡片审阅" },
  { href: "/phase4", label: "阶段四：导出文档" },
  { href: "/tools/gold-standard-converter", label: "工具：金标准转换" }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="h-full w-full rounded-xl bg-cfh-panel p-4 shadow-panel">
      <p className="mb-4 text-xs uppercase tracking-widest text-cfh-muted">CFH</p>
      <nav className="space-y-2">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "block rounded-lg px-3 py-2 text-sm transition",
                active
                  ? "bg-cfh-accent text-white"
                  : "text-cfh-ink hover:bg-cfh-bg hover:text-cfh-ink"
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
