import type { Project, ProjectFields, Task } from "@/types";
import { PROJECT_STATUS_COLORS } from "../../shared/constants.js";

// サーバーと共通の定数
export { MEMBER_COLORS, NO_PROJECT_ID, PRIORITIES, PROJECT_STATUSES, TASK_STATUSES } from "../../shared/constants.js";

// 担当者の絞り込みで「未割当」を表す値(メンバーIDとは重ならない)
export const UNASSIGNED = "__unassigned__";

export const statusStyle: Record<string, string> = {
  "未着手": "bg-slate-100 text-slate-700",
  "進行中": "bg-blue-100 text-blue-700",
  "回答待ち": "bg-amber-100 text-amber-800",
  "完了": "bg-emerald-100 text-emerald-700",
};

export const priorityStyle: Record<string, string> = {
  "高": "bg-red-50 text-red-600",
  "中": "bg-slate-100 text-slate-600",
  "低": "bg-slate-50 text-slate-400",
};

// 案件の色(進捗で自動で決まる)
export const projectColor = (status: string): string => (PROJECT_STATUS_COLORS as Record<string, string>)[status] ?? "bg-slate-400";

export const taskBarColor: Record<string, string> = { "未着手": "bg-slate-400", "進行中": "bg-blue-500", "回答待ち": "bg-amber-500", "完了": "bg-emerald-500" };

const priorityRank: Record<string, number> = { "高": 0, "中": 1, "低": 2 };

export const repeatOptions = [["", "なし"], ["daily", "毎日"], ["weekday", "平日(月〜金)"], ["weekly", "毎週"], ["monthly", "毎月"]] as const;
export const repeatLabel: Record<string, string> = { daily: "毎日", weekday: "平日", weekly: "毎週", monthly: "毎月" };

// 案件の並び順。開始日・期限がそろった案件を開始日→期限の順に並べ、欠けている案件は元の順のまま末尾に回す。
export const compareProjectOrder = (a: Project, b: Project) => {
  const aDated = !!a.startDate && !!a.due, bDated = !!b.startDate && !!b.due;
  if (aDated !== bDated) return aDated ? -1 : 1;
  if (!aDated) return 0;
  // 期限が開始日より前なら開始日を終わりとみなす
  const aEnd = a.due < a.startDate ? a.startDate : a.due, bEnd = b.due < b.startDate ? b.startDate : b.due;
  return a.startDate.localeCompare(b.startDate) || aEnd.localeCompare(bEnd);
};

// タスク一覧の並び。完了は末尾。未完了は期限なしを先頭に置き、あとは期限が近い順、同じ期限なら優先度の高い方を上に。
export const compareTasks = (a: Task, b: Task) => {
  const aDone = a.status === "完了", bDone = b.status === "完了";
  if (aDone !== bDone) return aDone ? 1 : -1;
  if (!a.due !== !b.due) return a.due ? 1 : -1;
  if (a.due !== b.due) return a.due < b.due ? -1 : 1;
  return (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9);
};

export const emptyProjectFields = (): ProjectFields => ({ name: "", category: "", status: "未着手", startDate: "", due: "", next: "", memberIds: [] });

export const inputClass = "w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-500";
export const selectClass = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm";
