"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  buildTermUnitMemberKey,
  type TermUnitCandidateDecision,
  type TermUnitMemberOverride
} from "@/lib/termUnits";
import type { ConceptCluster, ParsedDoc, TemplateOutline } from "@/lib/types";

interface TermUnitReviewProps {
  candidateDecisions: Record<string, TermUnitCandidateDecision>;
  onCommit: () => void;
  onResetToAuto: () => void;
  onSetCandidateDecision: (clusterId: string, decision: TermUnitCandidateDecision) => void;
  onSetMemberOverride: (memberKey: string, override?: TermUnitMemberOverride) => void;
  parsedDocs: ParsedDoc[];
  reviewed: boolean;
  templateOutline: TemplateOutline;
  units: ConceptCluster[];
  memberOverrides: Record<string, TermUnitMemberOverride>;
}

function groupUnits(units: ConceptCluster[]) {
  return {
    inScope: units.filter((unit) => unit.in_template_scope),
    outOfScope: units.filter((unit) => !unit.in_template_scope)
  };
}

export function TermUnitReview({
  candidateDecisions,
  onCommit,
  onResetToAuto,
  onSetCandidateDecision,
  onSetMemberOverride,
  parsedDocs,
  reviewed,
  templateOutline,
  units,
  memberOverrides
}: TermUnitReviewProps) {
  const termIndex = useMemo(() => {
    const index = new Map<string, ParsedDoc["terms"][number]>();
    parsedDocs.forEach((doc) => {
      doc.terms.forEach((term) => {
        index.set(buildTermUnitMemberKey(doc.author, term.id), term);
      });
    });
    return index;
  }, [parsedDocs]);

  const { inScope, outOfScope } = useMemo(() => groupUnits(units), [units]);
  const emptyTemplateUnits = inScope.filter((unit) => unit.members.length === 0);
  const populatedTemplateUnits = inScope.filter((unit) => unit.members.length > 0);
  const promotedCount = reviewed
    ? outOfScope.filter((unit) => unit.include_in_scope !== false).length
    : outOfScope.filter((unit) => candidateDecisions[unit.cluster_id]?.action === "promote").length;

  return (
    <div className="space-y-4" id="term-unit-review">
      <Card title="术语工作单元检查">
        <div className="space-y-3 text-sm">
          <p className="text-cfh-muted">
            系统已按模板术语自动汇总专家条目，并把未匹配模板的术语单独抽为候选组。请在这里完成最终检查，再进入阶段二。
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge tone="success">模板内工作单元 {inScope.length}</Badge>
            <Badge tone="warning">模板外候选 {outOfScope.length}</Badge>
            <Badge tone="neutral">已提升进正文 {promotedCount}</Badge>
          </div>
          {reviewed ? (
            <div className="flex flex-wrap gap-2">
              <p className="text-sm text-emerald-700">
                当前工作单元检查结果已生效。如需重做，可重新生成自动汇总结果再检查。
              </p>
              <Button onClick={onResetToAuto} type="button" variant="secondary">
                重新开始工作单元检查
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={onCommit} type="button">
                确认工作单元检查完成
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card title="模板内工作单元">
        <div className="space-y-4">
          <p className="text-sm text-cfh-muted">
            模板内术语会直接进入后续合并。这里仅允许把专家条目保留在当前模板术语、改挂到另一个模板术语，或移到模板外候选。
          </p>

          {emptyTemplateUnits.length > 0 ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-cfh-muted">
              当前有 {emptyTemplateUnits.length} 条模板术语暂未命中任何专家定义，后续会以“待补充”进入阶段二。
            </div>
          ) : null}

          {populatedTemplateUnits.length === 0 ? (
            <p className="text-sm text-cfh-muted">暂无已命中模板的专家术语。</p>
          ) : (
            <div className="space-y-4">
              {populatedTemplateUnits.map((unit) => (
                <div key={unit.cluster_id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-cfh-ink">
                        {unit.canonical_name_cn}
                        {unit.canonical_name_en ? ` / ${unit.canonical_name_en}` : ""}
                      </p>
                      <p className="text-xs text-cfh-muted">
                        {unit.template_term_id} · {unit.suggested_chapter}
                      </p>
                    </div>
                    <Badge tone={unit.gold_standard_term ? "success" : "neutral"}>
                      {unit.gold_standard_term ? "金标准覆盖" : `成员 ${unit.members.length}`}
                    </Badge>
                  </div>

                  <div className="mt-3 space-y-3">
                    {unit.members.map((member) => {
                      const memberKey = buildTermUnitMemberKey(member.author, member.term_id);
                      const term = termIndex.get(memberKey);
                      const override = memberOverrides[memberKey];

                      return (
                        <div
                          key={memberKey}
                          className="grid gap-3 rounded-md border border-slate-100 bg-slate-50 p-3 lg:grid-cols-[1.3fr_1fr_1fr]"
                        >
                          <div>
                            <p className="text-sm font-medium text-cfh-ink">
                              {member.author} / {member.term_name}
                            </p>
                            <p className="text-xs text-cfh-muted">
                              {term?.has_definition ? "有定义" : "无定义"} · {term?.chapter ?? "未分类"}
                            </p>
                          </div>

                          <label className="text-xs text-cfh-muted">
                            处理方式
                            <select
                              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-cfh-ink"
                              disabled={reviewed}
                              onChange={(event) => {
                                const value = event.target.value;
                                if (value === "keep") {
                                  onSetMemberOverride(memberKey, undefined);
                                  return;
                                }
                                if (value === "move_to_candidate") {
                                  onSetMemberOverride(memberKey, {
                                    action: "move_to_candidate"
                                  });
                                  return;
                                }
                                onSetMemberOverride(memberKey, {
                                  action: "move_to_template",
                                  template_term_id: override?.template_term_id || unit.template_term_id
                                });
                              }}
                              value={override?.action ?? "keep"}
                            >
                              <option value="keep">保留在当前模板术语</option>
                              <option value="move_to_template">改挂到其他模板术语</option>
                              <option value="move_to_candidate">移到模板外候选</option>
                            </select>
                          </label>

                          <label className="text-xs text-cfh-muted">
                            目标模板术语
                            <select
                              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-cfh-ink disabled:bg-slate-100"
                              disabled={reviewed || override?.action !== "move_to_template"}
                              onChange={(event) =>
                                onSetMemberOverride(memberKey, {
                                  action: "move_to_template",
                                  template_term_id: event.target.value
                                })
                              }
                              value={override?.template_term_id ?? unit.template_term_id ?? ""}
                            >
                              {templateOutline.terms.map((term) => (
                                <option key={term.template_term_id} value={term.template_term_id}>
                                  {term.name_cn}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card title="模板外候选术语">
        <div className="space-y-4">
          <p className="text-sm text-cfh-muted">
            模板外候选不会自动进入正文。你可以保留为候选、直接忽略，或提升进正文并确认章节。
          </p>

          {outOfScope.length === 0 ? (
            <p className="text-sm text-cfh-muted">当前没有模板外候选术语。</p>
          ) : (
            <div className="space-y-4">
              {outOfScope.map((unit) => {
                const decision = candidateDecisions[unit.cluster_id];
                const action = reviewed
                  ? unit.include_in_scope !== false
                    ? "promote"
                    : "candidate"
                  : decision?.action ?? "candidate";
                const chapterValue = decision?.chapter ?? unit.suggested_chapter ?? "";

                return (
                  <div key={unit.cluster_id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-cfh-ink">
                          {unit.canonical_name_cn || "未命名候选术语"}
                        </p>
                        <p className="text-xs text-cfh-muted">
                          {unit.members.length} 位专家提到 · 推荐章节 {unit.suggested_chapter || "待确认"}
                        </p>
                      </div>
                      <Badge tone={action === "promote" ? "success" : action === "ignore" ? "danger" : "warning"}>
                        {action === "promote" ? "提升进正文" : action === "ignore" ? "已忽略" : "保留候选"}
                      </Badge>
                    </div>

                    {unit.aliases && unit.aliases.length > 0 ? (
                      <p className="mt-2 text-xs text-cfh-muted">变体：{unit.aliases.join(" / ")}</p>
                    ) : null}
                    {unit.mounting_reason ? (
                      <p className="mt-1 text-xs text-cfh-muted">{unit.mounting_reason}</p>
                    ) : null}

                    <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
                      <label className="text-xs text-cfh-muted">
                        处理方式
                        <select
                          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-cfh-ink"
                          disabled={reviewed}
                          onChange={(event) =>
                            onSetCandidateDecision(unit.cluster_id, {
                              action: event.target.value as TermUnitCandidateDecision["action"],
                              chapter: chapterValue
                            })
                          }
                          value={action}
                        >
                          <option value="candidate">保留为候选</option>
                          <option value="ignore">忽略</option>
                          <option value="promote">提升进正文</option>
                        </select>
                      </label>

                      <label className="text-xs text-cfh-muted">
                        正文章节
                        <select
                          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-cfh-ink disabled:bg-slate-100"
                          disabled={reviewed || action !== "promote"}
                          onChange={(event) =>
                            onSetCandidateDecision(unit.cluster_id, {
                              action,
                              chapter: event.target.value
                            })
                          }
                          value={chapterValue}
                        >
                          {templateOutline.chapter_order.map((chapter) => (
                            <option key={chapter} value={chapter}>
                              {chapter}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="mt-3 space-y-2">
                      {unit.members.map((member) => (
                        <div
                          key={buildTermUnitMemberKey(member.author, member.term_id)}
                          className="rounded-md border border-amber-100 bg-white px-3 py-2 text-sm text-cfh-ink"
                        >
                          {member.author} / {member.term_name}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
