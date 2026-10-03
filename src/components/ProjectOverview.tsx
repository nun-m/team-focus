import { motion } from "framer-motion";
import { FileSpreadsheet, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PROJECT_STATUSES } from "@/lib/constants";
import type { Member, Project } from "@/types";
import { MemberAvatar } from "./Members";
import { OptionPicker } from "./OptionPicker";
import type { ProjectProgress } from "./Sidebar";

interface ProjectOverviewProps {
  project: Project;
  progress: ProjectProgress;
  members: Member[];
  onChangeStatus: (status: string) => void;
  onAddTask: () => void;
  onImportTasks: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ProjectOverview({ project: p, progress: pr, members, onChangeStatus, onAddTask, onImportTasks, onEdit, onDelete }: ProjectOverviewProps) {
  const pillButton = "rounded-full bg-white/10 hover:bg-white/20";

  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="rounded-2xl border-0 bg-slate-900 text-white shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">案件概要{p.category && ` ・ ${p.category}`}</p>
              <h2 className="text-2xl font-bold">{p.name}</h2>
              {p.next
                ? <p className="mt-2 text-sm text-slate-300">次のアクション: {p.next}</p>
                : <button onClick={onEdit} className="mt-2 text-sm text-slate-500 underline hover:text-slate-300">次のアクションを設定</button>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400">担当</span>
                {members.map(m => (
                  <span key={m.id} className="flex items-center gap-1.5 rounded-full bg-white/10 py-0.5 pr-2.5 pl-0.5 text-xs"><MemberAvatar member={m} />{m.name}</span>
                ))}
                {members.length === 0 && <button onClick={onEdit} className="text-xs text-slate-500 underline hover:text-slate-300">担当メンバーを設定</button>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <OptionPicker value={p.status} options={PROJECT_STATUSES} onChange={onChangeStatus} placeholder="進捗未設定" title="クリックで進捗を変更" triggerClassName="px-3" chevron />
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs">{p.startDate && `${p.startDate} 〜 `}期限 {p.due || "未設定"}</span>
              <button onClick={onAddTask} title="この案件にタスクを追加" className={`flex items-center gap-1 px-3 py-2 text-xs font-medium ${pillButton}`}><Plus className="h-4 w-4" />タスク追加</button>
              <button onClick={onImportTasks} title="Excelのタスク一覧をこの案件にまとめて登録" className={`p-2 ${pillButton}`}><FileSpreadsheet className="h-4 w-4" /></button>
              <button onClick={onEdit} title="案件を編集" className={`p-2 ${pillButton}`}><Pencil className="h-4 w-4" /></button>
              <button onClick={onDelete} title="案件を削除" className="rounded-full bg-white/10 p-2 hover:bg-red-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>進捗</span>
              <span>{pr.total ? `完了 ${pr.done}/${pr.total} ・ ${pr.pct}%` : "タスク未登録"}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/15">
              <motion.div initial={{ width: 0 }} animate={{ width: `${pr.pct}%` }} className="h-full rounded-full bg-emerald-400" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
