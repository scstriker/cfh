import Link from "next/link";
import { Card } from "@/components/ui/Card";

const phaseCards = [
  {
    href: "/phase1",
    title: "阶段一：文档解析与工作单元检查",
    desc: "导入模板、金标准、专家稿，并自动汇总术语工作单元。"
  },
  { href: "/phase2", title: "阶段二：AI 合并", desc: "逐术语工作单元调用 Gemini，生成合并建议稿。" },
  { href: "/phase3", title: "阶段三：卡片审阅", desc: "专家逐条审阅并给出最终决策。" },
  { href: "/phase4", title: "阶段四：导出文档", desc: "按 GB/T 模板导出可提交的 .docx 文档。" },
  {
    href: "/tools/gold-standard-converter",
    title: "工具：金标准转换",
    desc: "将百问百答等说明性材料转换为可导入的金标准 CSV。"
  }
];

export default function HomePage() {
  return (
    <div className="space-y-4">
      <Card title="实施计划导览">
        <p className="text-sm text-cfh-muted">
          当前流程已收敛为：模板骨架、金标准、专家草稿导入后，在阶段一内自动汇总术语工作单元，再进入阶段二合并。
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
