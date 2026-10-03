import { motion } from "framer-motion";
import { CheckCircle2, Circle, ExternalLink, FileText, Pencil, Repeat, Trash2 } from "lucide-react";
import { NO_PROJECT_ID, PRIORITIES, TASK_STATUSES, priorityStyle, repeatLabel } from "@/lib/constants";
import type { Member, Project, Task } from "@/types";
import { AssigneePicker } from "./Members";
import { OptionPicker } from "./OptionPicker";
import { TaskDueButton } from "./TaskDueButton";

// 削除の確認ボタン。メンバーの一覧でも使う。
export function ConfirmDeleteButtons({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <span className="flex items-center gap-1">
      <button onClick={onConfirm} className="rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700">削除</button>
      <button onClick={onCancel} className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">取消</button>
    </span>
  );
}

// ホバー時だけ出す操作ボタン。キーボード操作でもフォーカスが当たれば見えるようにする。
const hoverActionClass = "rounded-lg p-2 text-slate-300 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100";

interface TaskRowProps {
  task: Task;
  project: Project | undefined;
  members: Member[];
  index: number;
  confirmingDelete: boolean;
  onToggleDone: () => void;
  onPatch: (fields: Partial<Task>) => void;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}

export function TaskRow({ task: t, project, members, index, confirmingDelete, onToggleDone, onPatch, onEdit, onAskDelete, onCancelDelete, onDelete }: TaskRowProps) {
  const done = t.status === "完了";

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      // 件数が多くても待たされないよう、ずらし表示は先頭の数行だけにする
      transition={{ delay: Math.min(index, 8) * .03 }}
      className="group flex items-center gap-4 px-6 py-4 hover:bg-slate-50"
    >
      <button onClick={onToggleDone} title={done ? "未完了に戻す" : "完了にする"}>
        {done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-slate-300" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <button onClick={onEdit} title="クリックでタスクを編集" className={`truncate text-left text-sm font-semibold hover:underline ${done ? "text-slate-400 line-through" : ""}`}>{t.title}</button>
          {t.repeat && (
            <span title={`${repeatLabel[t.repeat]}の繰り返し`} className="flex shrink-0 items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              <Repeat className="h-3 w-3" />{repeatLabel[t.repeat]}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {t.projectId === NO_PROJECT_ID ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">案件外</span> : project?.name}
        </p>
      </div>

      <div className="flex w-[60px] shrink-0 items-center justify-end gap-1">
        {t.link && (
          <a href={t.link} target="_blank" rel="noopener noreferrer" title={`参照リンクを開く: ${t.link}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-violet-600">
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        {t.fileLink && (
          <a href={t.fileLink} target="_blank" rel="noopener noreferrer" title={`ファイルを開く: ${t.fileLink}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-teal-600">
            <FileText className="h-4 w-4" />
          </a>
        )}
      </div>

      <div className="w-24 shrink-0">
        <AssigneePicker members={members} value={t.assigneeId} onChange={assigneeId => onPatch({ assigneeId })} showName />
      </div>

      <TaskDueButton
        due={t.due}
        start={t.startDate}
        repeat={t.repeat}
        done={done}
        onChange={due => onPatch({ due })}
        onChangeStart={startDate => onPatch({ startDate })}
        onChangeRepeat={repeat => onPatch({ repeat })}
      />
      <OptionPicker value={t.status} options={TASK_STATUSES} onChange={status => onPatch({ status: status as Task["status"] })} title="クリックで進捗を変更" triggerClassName="w-[72px] shrink-0 px-2 hover:brightness-95" />
      <OptionPicker value={t.priority} options={PRIORITIES} styles={priorityStyle} onChange={priority => onPatch({ priority: priority as Task["priority"] })} title="クリックで優先度を変更" triggerClassName="w-7 shrink-0 hover:brightness-95" />

      {confirmingDelete ? (
        <ConfirmDeleteButtons onConfirm={onDelete} onCancel={onCancelDelete} />
      ) : (
        <span className="flex">
          <button onClick={onEdit} title="タスクを編集" className={`${hoverActionClass} hover:bg-slate-100 hover:text-slate-600`}><Pencil className="h-4 w-4" /></button>
          <button onClick={onAskDelete} title="タスクを削除" className={`${hoverActionClass} hover:bg-red-50 hover:text-red-600`}><Trash2 className="h-4 w-4" /></button>
        </span>
      )}
    </motion.div>
  );
}
