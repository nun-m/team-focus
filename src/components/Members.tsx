import { useState } from "react";
import { Check, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { Popover } from "radix-ui";
import { Button } from "@/components/ui/button";
import { MEMBER_COLORS, inputClass } from "@/lib/constants";
import type { Member, MemberFields } from "@/types";
import { Field, Modal } from "./Modal";
import { popoverClass } from "./OptionPicker";
import { ConfirmDeleteButtons } from "./TaskRow";

const AVATAR_SIZE = { sm: "h-6 w-6 text-[10px]", md: "h-7 w-7 text-xs", lg: "h-9 w-9 text-sm" } as const;

// 名前の先頭1文字を丸に入れたアイコン。未割当(memberなし)は点線の丸。
export function MemberAvatar({ member, size = "sm", title }: { member: Member | undefined; size?: keyof typeof AVATAR_SIZE; title?: string }) {
  const sizeClass = AVATAR_SIZE[size];
  if (!member) {
    return (
      <span title={title ?? "未割当"} className={`flex shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-300 ${sizeClass}`}>
        <UserRound className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span title={title ?? member.name} className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${member.color} ${sizeClass}`}>
      {member.name.slice(0, 1)}
    </span>
  );
}

// 重ねて並べたアイコン(案件の担当メンバーなど)
export function MemberStack({ members, max = 4 }: { members: Member[]; max?: number }) {
  if (members.length === 0) return null;
  const rest = members.length - max;
  return (
    <span className="flex items-center -space-x-1.5" title={members.map(m => m.name).join("、")}>
      {members.slice(0, max).map(m => <span key={m.id} className="rounded-full ring-2 ring-white"><MemberAvatar member={m} title="" /></span>)}
      {rest > 0 && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 ring-2 ring-white">+{rest}</span>}
    </span>
  );
}

interface AssigneePickerProps {
  members: Member[];
  value: string;
  onChange: (assigneeId: string) => void;
  // 名前も並べて出す(一覧の行では省略してアイコンだけ)
  showName?: boolean;
}

// 担当者のアイコン。クリックで一覧を開き、その場で担当者を変える。
export function AssigneePicker({ members, value, onChange, showName = false }: AssigneePickerProps) {
  const [open, setOpen] = useState(false);
  const current = members.find(m => m.id === value);
  const options: { id: string; member: Member | undefined; label: string }[] = [
    { id: "", member: undefined, label: "未割当" },
    ...members.map(m => ({ id: m.id, member: m, label: m.name })),
  ];

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button title={`担当: ${current?.name ?? "未割当"}(クリックで変更)`} className="flex shrink-0 items-center gap-1.5 rounded-full hover:brightness-95">
          <MemberAvatar member={current} title="" />
          {showName && <span className={`truncate text-xs ${current ? "text-slate-700" : "text-slate-400"}`}>{current?.name ?? "未割当"}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="end" sideOffset={6} collisionPadding={12} className={`max-h-72 w-44 overflow-y-auto py-1 ${popoverClass}`}>
          {options.map(o => (
            <button key={o.id} onClick={() => { setOpen(false); if (o.id !== value) onChange(o.id); }} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-slate-50">
              <MemberAvatar member={o.member} title="" />
              <span className={o.member ? "text-slate-700" : "text-slate-400"}>{o.label}</span>
              {o.id === value && <Check className="ml-auto h-3.5 w-3.5 text-slate-400" />}
            </button>
          ))}
          {members.length === 0 && <p className="px-2.5 py-1.5 text-[11px] text-slate-400">メンバーが未登録です</p>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// フォーム用の担当者選択(select)
export function AssigneeSelect({ members, value, onChange, className }: { members: Member[]; value: string; onChange: (id: string) => void; className: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={className}>
      <option value="">未割当</option>
      {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  );
}

// 案件フォーム用。メンバーを押して担当の付け外しをする。
export function MemberToggleList({ members, value, onChange }: { members: Member[]; value: string[]; onChange: (ids: string[]) => void }) {
  if (members.length === 0) return <p className="text-xs text-slate-400">メンバーが未登録です。サイドバーの「メンバー」から登録してください</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {members.map(m => {
        const on = value.includes(m.id);
        return (
          <button key={m.id} onClick={() => onChange(on ? value.filter(id => id !== m.id) : [...value, m.id])} className={`flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-xs font-medium ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <MemberAvatar member={m} title="" />{m.name}
          </button>
        );
      })}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {MEMBER_COLORS.map(c => (
        <button key={c} onClick={() => onChange(c)} title={c === value ? "選択中" : "この色にする"} className={`h-6 w-6 rounded-full ${c} ${value === c ? "ring-2 ring-slate-900 ring-offset-2" : ""}`} />
      ))}
    </div>
  );
}

interface MembersModalProps {
  members: Member[];
  // メンバーごとの未完了タスク数(削除時の案内に使う)
  openTaskCounts: Record<string, number>;
  onAdd: (fields: MemberFields) => Promise<boolean>;
  onUpdate: (id: string, fields: MemberFields) => Promise<boolean>;
  onDelete: (id: string) => void;
  onClose: () => void;
}

// メンバーの登録・編集・削除
export function MembersModal({ members, openTaskCounts, onAdd, onUpdate, onDelete, onClose }: MembersModalProps) {
  const nextColor = () => MEMBER_COLORS[members.length % MEMBER_COLORS.length];
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(nextColor);
  const [editing, setEditing] = useState<(MemberFields & { id: string }) | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const add = async () => {
    if (!newName.trim()) return;
    if (await onAdd({ name: newName.trim(), color: newColor })) {
      setNewName("");
      setNewColor(MEMBER_COLORS[(members.length + 1) % MEMBER_COLORS.length]);
    }
  };

  const saveEdit = async () => {
    if (!editing || !editing.name.trim()) return;
    if (await onUpdate(editing.id, { name: editing.name.trim(), color: editing.color })) setEditing(null);
  };

  return (
    <Modal title="メンバー" onClose={onClose}>
      <div className="space-y-1">
        {members.map(m => editing?.id === m.id ? (
          <div key={m.id} className="space-y-3 rounded-xl bg-slate-50 p-3">
            <input autoFocus value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} onKeyDown={e => { if (e.key === "Enter") saveEdit(); }} className={inputClass} />
            <ColorPicker value={editing.color} onChange={color => setEditing({ ...editing, color })} />
            <div className="flex gap-2">
              <Button onClick={saveEdit} disabled={!editing.name.trim()} className="flex-1 rounded-xl bg-slate-900">保存する</Button>
              <Button onClick={() => setEditing(null)} variant="outline" className="rounded-xl">キャンセル</Button>
            </div>
          </div>
        ) : (
          <div key={m.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
            <MemberAvatar member={m} size="md" />
            <span className="flex-1 truncate text-sm font-medium">{m.name}</span>
            <span className="text-[11px] text-slate-400">未完了 {openTaskCounts[m.id] ?? 0}</span>
            {confirmDelete === m.id ? (
              <ConfirmDeleteButtons onConfirm={() => { onDelete(m.id); setConfirmDelete(null); }} onCancel={() => setConfirmDelete(null)} />
            ) : (
              <span className="flex">
                <button onClick={() => setEditing({ id: m.id, name: m.name, color: m.color })} title="編集" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => setConfirmDelete(m.id)} title="削除(担当していたタスクは未割当に戻ります)" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </span>
            )}
          </div>
        ))}
        {members.length === 0 && <p className="py-4 text-center text-sm text-slate-400">メンバーが未登録です</p>}
      </div>

      <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
        <Field label="メンバーを追加">
          <div className="flex gap-2">
            <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(); }} className={inputClass} placeholder="名前(例: 山田)" />
            <Button onClick={add} disabled={!newName.trim()} className="h-auto rounded-xl bg-slate-900"><Plus className="h-4 w-4" /></Button>
          </div>
        </Field>
        <ColorPicker value={newColor} onChange={setNewColor} />
      </div>
    </Modal>
  );
}
