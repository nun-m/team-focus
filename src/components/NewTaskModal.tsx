import { useRef, useState } from "react";
import { CheckCircle2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputClass, repeatOptions, selectClass } from "@/lib/constants";
import { DUE_SHORTCUTS, repeatHint, shiftISO, todayISO } from "@/lib/dates";
import type { Member, Project, RepeatRule, Task } from "@/types";
import { AssigneeSelect } from "./Members";
import { Field, Modal } from "./Modal";
import { ProjectOptions } from "./ProjectOptions";

export interface NewTaskInput {
  projectId: string;
  title: string;
  link: string;
  fileLink: string;
  due: string;
  startDate: string;
  repeat: RepeatRule;
  assigneeId: string;
}

interface NewTaskModalProps {
  projects: Project[];
  members: Member[];
  initialProjectId: string;
  initialAssigneeId: string;
  onAdd: (input: NewTaskInput) => Promise<Task | null>;
  // 閉じるときに、このモーダルで追加できたタスクを渡す
  onClose: (added: Task[]) => void;
}

// タスク追加。開いたままにして連続登録できるようにし、画面遷移は閉じるときに呼び出し側でまとめて行う。
export function NewTaskModal({ projects, members, initialProjectId, initialAssigneeId, onAdd, onClose }: NewTaskModalProps) {
  const [projectId, setProjectId] = useState(initialProjectId);
  const [assigneeId, setAssigneeId] = useState(initialAssigneeId);
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [fileLink, setFileLink] = useState("");
  const [due, setDue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [repeat, setRepeat] = useState<RepeatRule>("");
  const [added, setAdded] = useState<Task[]>([]);
  const titleRef = useRef<HTMLInputElement>(null);

  const add = () => {
    if (!title.trim()) return;
    onAdd({ projectId, title: title.trim(), link: link.trim(), fileLink: fileLink.trim(), due, startDate, repeat, assigneeId })
      .then(created => { if (created) setAdded(prev => [created, ...prev]); });
    // 日付・繰り返し・案件・担当者は続けて入力することが多いので残す
    setTitle(""); setLink(""); setFileLink("");
    titleRef.current?.focus();
  };
  const addOnEnter = (e: React.KeyboardEvent) => { if (e.key === "Enter") add(); };
  const close = () => onClose(added);
  const hint = repeatHint(due, repeat);
  const smallButtonClass = "rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200";
  const clearButtonClass = "rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600";

  return (
    <Modal title="タスクを追加" onClose={close}>
      <div className="space-y-4">
        <Field label="関連する案件">
          <select value={projectId} onChange={e => setProjectId(e.target.value)} className={selectClass}>
            <ProjectOptions projects={projects} noProjectLabel="案件外(問い合わせ対応など)" />
          </select>
        </Field>

        <Field label="タスク名">
          <input ref={titleRef} autoFocus value={title} onChange={e => setTitle(e.target.value)} onKeyDown={addOnEnter} className={inputClass} placeholder="次に実行する具体的な作業" />
        </Field>

        <Field label="担当者">
          <AssigneeSelect members={members} value={assigneeId} onChange={setAssigneeId} className={selectClass} />
        </Field>

        <Field label="開始日(任意)">
          <div className="flex items-center gap-2">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} onKeyDown={addOnEnter} className={`${inputClass} flex-1`} />
            <button onClick={() => setStartDate(todayISO())} className={smallButtonClass}>今日</button>
            {startDate && <button onClick={() => setStartDate("")} title="開始日を解除" className={clearButtonClass}><X className="h-4 w-4" /></button>}
          </div>
        </Field>

        <Field label="期限(任意)">
          <div className="flex items-center gap-2">
            <input type="date" value={due} onChange={e => setDue(e.target.value)} onKeyDown={addOnEnter} className={`${inputClass} flex-1`} />
            {DUE_SHORTCUTS.map(([label, days]) => (
              <button key={label} onClick={() => setDue(shiftISO(todayISO(), days))} className={smallButtonClass}>{label}</button>
            ))}
            {due && <button onClick={() => setDue("")} title="期限を解除" className={clearButtonClass}><X className="h-4 w-4" /></button>}
          </div>
          {!due && <p className="mt-1 text-[11px] text-slate-400">期限なしのタスクは「今日の作業」には出ません</p>}
        </Field>

        <Field label="繰り返し(任意)">
          <select value={repeat} onChange={e => setRepeat(e.target.value as RepeatRule)} className={selectClass}>
            {repeatOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
        </Field>

        <Field label="参照リンク(任意)">
          <input value={link} onChange={e => setLink(e.target.value)} onKeyDown={addOnEnter} className={inputClass} placeholder="関連するページやメッセージのURLを貼り付け" />
        </Field>

        <Field label="ファイルのリンク(任意)">
          <input value={fileLink} onChange={e => setFileLink(e.target.value)} onKeyDown={addOnEnter} className={inputClass} placeholder="共有フォルダやクラウド上のファイルのURLを貼り付け" />
        </Field>
      </div>

      <div className="mt-6 flex gap-2">
        <Button onClick={add} className="flex-1 rounded-xl bg-slate-900"><Plus className="mr-1 h-4 w-4" />追加</Button>
        <Button onClick={close} variant="outline" className="rounded-xl">閉じる</Button>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">Enterで追加。続けて入力できます(Escで閉じる)</p>

      {added.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="mb-2 text-xs font-semibold text-emerald-600">{added.length}件追加しました</p>
          <div className="max-h-28 space-y-1 overflow-y-auto">
            {added.map(t => (
              <p key={t.id} className="flex items-center gap-1.5 truncate text-xs text-slate-500" title={t.title}>
                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />{t.title}
              </p>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
