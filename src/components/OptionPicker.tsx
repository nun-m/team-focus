import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover } from "radix-ui";
import { statusStyle } from "@/lib/constants";

// カード側の overflow-hidden で切れないよう、ポップオーバーはポータルに出す。
// 画面下端では自動で上向きに開く(Popoverの衝突回避)。
export const popoverClass = "z-50 rounded-xl border border-slate-200 bg-white shadow-lg";

interface OptionPickerProps {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  styles?: Record<string, string>;
  placeholder?: string;
  title?: string;
  triggerClassName?: string;
  chevron?: boolean;
}

// 進捗・優先度などのバッジ。クリックで一覧を開き、その場で変更できる。
export function OptionPicker({ value, options, onChange, styles = statusStyle, placeholder = "未設定", title = "クリックで変更", triggerClassName = "", chevron = false }: OptionPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button title={title} className={`flex items-center justify-center gap-1 rounded-full py-1 text-xs font-medium ${styles[value] || "bg-slate-100 text-slate-700"} ${triggerClassName}`}>
          {value || placeholder}{chevron && <ChevronDown className={`h-3.5 w-3.5 opacity-60 transition ${open ? "rotate-180" : ""}`} />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="end" sideOffset={6} collisionPadding={12} className={`w-36 overflow-hidden py-1 ${popoverClass}`}>
          {options.map(option => (
            <button key={option} onClick={() => { setOpen(false); if (option !== value) onChange(option); }} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-slate-50">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[option]}`}>{option}</span>
              {option === value && <Check className="ml-auto h-3.5 w-3.5 text-slate-400" />}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
