import { useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { Popover } from "radix-ui";
import { repeatOptions } from "@/lib/constants";
import { DUE_SHORTCUTS, repeatHint, shiftISO, todayISO } from "@/lib/dates";
import type { RepeatRule } from "@/types";
import { popoverClass } from "./OptionPicker";

interface TaskDueButtonProps {
  due: string;
  start: string;
  repeat: RepeatRule;
  done: boolean;
  onChange: (due: string) => void;
  onChangeStart: (start: string) => void;
  onChangeRepeat: (repeat: RepeatRule) => void;
}

// タスクの期限。クリックでカレンダーを開き、その場で変更・解除できる。
export function TaskDueButton({ due, start, repeat, done, onChange, onChangeStart, onChangeRepeat }: TaskDueButtonProps) {
  const [open, setOpen] = useState(false);
  const today = todayISO();
  const overdue = !!due && !done && due < today;
  const isToday = !!due && due === today;
  const tone = overdue ? "bg-red-50 text-red-600" : isToday ? "bg-amber-50 text-amber-700" : due ? "bg-slate-100 text-slate-600" : "text-slate-300 hover:bg-slate-100 hover:text-slate-500";
  // カレンダーの月送りだけでも値が変わるため、値の変更では閉じない(閉じるのは枠外クリック・Esc・ボタン操作のみ)
  const update = (value: string) => { if (value !== due) onChange(value); };
  const updateStart = (value: string) => { if (value !== start) onChangeStart(value); };
  const pickAndClose = (value: string) => { setOpen(false); update(value); };
  const tooltip = due
    ? `${start ? `${start} 〜 ` : ""}期限 ${due}${overdue ? "(期限超過)" : ""} ・ クリックで変更`
    : start ? `開始日 ${start} ・ 期限未設定 ・ クリックで変更` : "クリックで開始日・期限を設定";
  const hint = repeatHint(due, repeat);
  const dateInputClass = "min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-slate-500";
  const clearClass = "rounded-lg p-1 text-slate-300 hover:bg-slate-100 hover:text-red-600";
  const rowLabelClass = "w-12 shrink-0 text-[11px] font-semibold text-slate-500";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button title={tooltip} className={`flex w-[70px] shrink-0 items-center justify-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${tone}`}>
          <CalendarDays className="h-3.5 w-3.5" />{due ? due.slice(5).replace("-", "/") : "期限"}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="end" sideOffset={6} collisionPadding={12} className={`w-64 p-3 ${popoverClass}`}>
          <div className="flex items-center gap-2">
            <label className={rowLabelClass}>開始日</label>
            <input type="date" value={start || ""} onChange={e => updateStart(e.target.value)} className={dateInputClass} />
            <button onClick={() => updateStart("")} title="開始日を解除" className={`${clearClass} ${start ? "" : "invisible"}`}><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label className={rowLabelClass}>期限</label>
            <input type="date" autoFocus value={due || ""} onChange={e => update(e.target.value)} className={dateInputClass} />
            <button onClick={() => update("")} title="期限を解除" className={`${clearClass} ${due ? "" : "invisible"}`}><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2">
            <label className={rowLabelClass}>繰り返し</label>
            <select value={repeat || ""} onChange={e => onChangeRepeat(e.target.value as RepeatRule)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-slate-500">
              {repeatOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {hint && <p className={`mt-1 text-[11px] ${due ? "text-slate-400" : "text-amber-600"}`}>{hint}</p>}
          <div className="mt-2 flex items-center gap-1 border-t border-slate-100 pt-2">
            <span className="text-[11px] text-slate-400">期限:</span>
            {DUE_SHORTCUTS.map(([label, days]) => (
              <button key={label} onClick={() => pickAndClose(shiftISO(today, days))} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-200">{label}</button>
            ))}
            <button onClick={() => setOpen(false)} className="ml-auto rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-700">閉じる</button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
