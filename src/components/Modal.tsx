import { useEffect, type ReactNode } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

// モーダルの共通枠。Esc・枠外クリック・右上の×で閉じる。一覧を見せるものはwideで広げる。
export function Modal({ title, onClose, wide = false, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ opacity: 0, scale: .97 }} animate={{ opacity: 1, scale: 1 }} role="dialog" aria-modal="true" aria-label={title} className={`max-h-full w-full ${wide ? "max-w-3xl" : "max-w-md"} overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl`}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} title="閉じる (Esc)" className="rounded-lg p-1 hover:bg-slate-100"><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

// ラベル付きの入力欄。並べるときは親に space-y-4 を付ける。
// 中に複数のボタンを置くことがあるため、label要素では囲まない(ラベルのクリックが先頭のボタンに飛ぶ)。
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <div className="mt-2">{children}</div>
    </div>
  );
}
