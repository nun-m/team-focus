import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PROJECT_STATUSES, inputClass, selectClass } from "@/lib/constants";
import type { Member, Project, ProjectFields } from "@/types";
import { MemberToggleList } from "./Members";
import { Field, Modal } from "./Modal";

interface ProjectFormModalProps {
  title: string;
  submitLabel: string;
  initial: ProjectFields;
  members: Member[];
  onSubmit: (fields: ProjectFields) => void;
  onClose: () => void;
}

// 案件の追加・編集で共通のフォーム
export function ProjectFormModal({ title, submitLabel, initial, members, onSubmit, onClose }: ProjectFormModalProps) {
  const [form, setForm] = useState<ProjectFields>(initial);
  const set = (fields: Partial<ProjectFields>) => setForm(prev => ({ ...prev, ...fields }));
  const submit = () => { if (form.name.trim()) onSubmit(form); };
  // 以前の版で使っていた進捗(回答待ちなど)も、選び直すまでは選択肢に残す
  const statuses = PROJECT_STATUSES.includes(form.status) ? PROJECT_STATUSES : [form.status, ...PROJECT_STATUSES];

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <Field label="案件名">
          <input autoFocus value={form.name} onChange={e => set({ name: e.target.value })} onKeyDown={e => { if (e.key === "Enter") submit(); }} className={inputClass} placeholder="例: 新システム導入プロジェクト" />
        </Field>
        <Field label="カテゴリ">
          <input value={form.category} onChange={e => set({ category: e.target.value })} className={inputClass} />
        </Field>
        <Field label="担当メンバー">
          <MemberToggleList members={members} value={form.memberIds} onChange={memberIds => set({ memberIds })} />
        </Field>
        <Field label="進捗">
          <select value={form.status} onChange={e => set({ status: e.target.value })} className={selectClass}>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="開始日">
            <input type="date" value={form.startDate} onChange={e => set({ startDate: e.target.value })} className={inputClass} />
          </Field>
          <Field label="期限">
            <input type="date" value={form.due} onChange={e => set({ due: e.target.value })} className={inputClass} />
          </Field>
        </div>
        <Field label="次のアクション">
          <input value={form.next} onChange={e => set({ next: e.target.value })} className={inputClass} />
        </Field>
      </div>
      <div className="mt-6 flex gap-2">
        <Button onClick={submit} disabled={!form.name.trim()} className="flex-1 rounded-xl bg-slate-900">{submitLabel}</Button>
        <Button onClick={onClose} variant="outline" className="rounded-xl">キャンセル</Button>
      </div>
    </Modal>
  );
}

interface DeleteProjectModalProps {
  project: Project;
  taskCount: number;
  onDelete: (mode: "detach" | "delete") => void;
  onClose: () => void;
}

export function DeleteProjectModal({ project, taskCount, onDelete, onClose }: DeleteProjectModalProps) {
  return (
    <Modal title="案件を削除" onClose={onClose}>
      <p className="text-sm text-slate-700">「{project.name}」を削除します。元に戻せません。</p>
      <p className="mt-2 text-xs text-slate-500">{taskCount > 0 ? `この案件には ${taskCount} 件のタスクがあります。タスクの扱いを選んでください。` : "この案件にタスクはありません。"}</p>
      <div className="mt-5 space-y-2">
        {taskCount > 0 && <Button onClick={() => onDelete("detach")} className="w-full rounded-xl bg-slate-900">タスクを「案件外」に移して削除</Button>}
        <Button onClick={() => onDelete("delete")} className="w-full rounded-xl bg-red-600 hover:bg-red-700">{taskCount > 0 ? "タスクごと削除" : "削除する"}</Button>
        <Button onClick={onClose} variant="outline" className="w-full rounded-xl">取消</Button>
      </div>
    </Modal>
  );
}
