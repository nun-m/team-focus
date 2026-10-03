import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PRIORITIES, inputClass, priorityStyle, selectClass } from "@/lib/constants";
import type { Member, Project, Task, TaskEditFields } from "@/types";
import { AssigneeSelect } from "./Members";
import { Field, Modal } from "./Modal";
import { ProjectOptions } from "./ProjectOptions";

interface TaskEditModalProps {
  task: Task;
  projects: Project[];
  members: Member[];
  onSave: (fields: TaskEditFields) => void;
  onClose: () => void;
}

// 登録後のタスクの編集。期限・繰り返し・進捗は一覧の各バッジから直接変えられるので、ここでは扱わない。
export function TaskEditModal({ task, projects, members, onSave, onClose }: TaskEditModalProps) {
  const [form, setForm] = useState<TaskEditFields>({ title: task.title, projectId: task.projectId, priority: task.priority, link: task.link, fileLink: task.fileLink, assigneeId: task.assigneeId });
  const set = (fields: Partial<TaskEditFields>) => setForm(prev => ({ ...prev, ...fields }));
  const save = () => { if (form.title.trim()) onSave({ ...form, title: form.title.trim(), link: form.link.trim(), fileLink: form.fileLink.trim() }); };

  return (
    <Modal title="タスクを編集" onClose={onClose}>
      <div className="space-y-4">
        <Field label="タスク名">
          <input autoFocus value={form.title} onChange={e => set({ title: e.target.value })} onKeyDown={e => { if (e.key === "Enter") save(); }} className={inputClass} />
        </Field>
        <Field label="関連する案件">
          <select value={form.projectId} onChange={e => set({ projectId: e.target.value })} className={selectClass}>
            <ProjectOptions projects={projects} noProjectLabel="案件外(問い合わせ対応など)" />
          </select>
        </Field>
        <Field label="担当者">
          <AssigneeSelect members={members} value={form.assigneeId} onChange={assigneeId => set({ assigneeId })} className={selectClass} />
        </Field>
        <Field label="優先度">
          <div className="flex gap-2">
            {PRIORITIES.map(p => (
              <button key={p} onClick={() => set({ priority: p as Task["priority"] })} className={`flex-1 rounded-xl py-2 text-sm font-medium ${priorityStyle[p]} ${form.priority === p ? "ring-2 ring-slate-900" : ""}`}>{p}</button>
            ))}
          </div>
        </Field>
        <Field label="参照リンク(任意)">
          <input value={form.link} onChange={e => set({ link: e.target.value })} className={inputClass} placeholder="関連するページやメッセージのURLを貼り付け" />
        </Field>
        <Field label="ファイルのリンク(任意)">
          <input value={form.fileLink} onChange={e => set({ fileLink: e.target.value })} className={inputClass} placeholder="共有フォルダやクラウド上のファイルのURLを貼り付け" />
        </Field>
      </div>
      <div className="mt-6 flex gap-2">
        <Button onClick={save} disabled={!form.title.trim()} className="flex-1 rounded-xl bg-slate-900">保存する</Button>
        <Button onClick={onClose} variant="outline" className="rounded-xl">キャンセル</Button>
      </div>
    </Modal>
  );
}
