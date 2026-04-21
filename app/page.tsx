import Link from "next/link";
import { Card } from "@/components/ui/Card";

const phaseCards = [
  { href: "/phase0", title: "阶段零：概念对齐", desc: "汇总术语并语义聚类，形成概念映射。" },
  { href: "/phase1", title: "阶段一：文档解析", desc: "导入 DOCX、抽取术语条目并形成覆盖矩阵。" },
  { href: "/phase2", title: "阶段二：AI 合并", desc: "逐概念簇调用 Gemini，生成合并建议稿。" },
  { href: "/phase3", title: "阶段三：卡片审阅", desc: "专家逐条审阅并给出最终决策。" },
  { href: "/phase4", title: "阶段四：导出文档", desc: "按 GB/T 模板导出可提交的 .docx 文档。" }
];

export default function HomePage() {
  return (
    <div className="space-y-4">
      <Card title="实施计划导览">
        <p className="text-sm text-cfh-muted">
          当前按 implementation_plan 的优先级推进：先完成 Phase 1 基础框架，再落地 Phase
          2 文档解析链路。
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {phaseCards.map((card) => (
          <Link key={card.href} href={card.href} className="rounded-xl transition hover:-translate-y-0.5">
            <Card className="h-full">
              <h2 className="mb-2 text-lg font-semibold text-cfh-ink">{card.title}</h2>
              <p className="text-sm text-cfh-muted">{card.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
