import { useRef, useState } from "react";
import { AlertCircle, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { repeatLabel, selectClass } from "@/lib/constants";
import { TEMPLATE_HEADERS, parseTaskSheet, toRequestBody, type ImportRow, type ImportTaskBody } from "@/lib/taskImport";
import type { Member, Project } from "@/types";
import { Field, Modal } from "./Modal";
import { ProjectOptions } from "./ProjectOptions";

interface ImportTasksModalProps {
  projects: Project[];
  members: Member[];
  initialProjectId: string;
  // 登録できたら呼び出し側で閉じる。失敗したら例外にしてモーダル内に表示する
  onImport: (projectId: string, tasks: ImportTaskBody[]) => Promise<void>;
  onClose: () => void;
}

// Excelのタスク一覧を読み込み、内容を確認してから選んだ案件にまとめて登録する。
// Excelの読み書きは使うときだけ読み込む(普段の画面を重くしない)。
export function ImportTasksModal({ projects, members, initialProjectId, onImport, onClose }: ImportTasksModalProps) {
  const [projectId, setProjectId] = useState(initialProjectId);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const errorCount = rows.filter(r => r.errors.length > 0).length;
  const canImport = rows.length > 0 && errorCount === 0 && !importing;

  const readFile = async (file: File) => {
    setFileName(file.name);
    setRows([]);
    setError(null);
    try {
      const { readSheet } = await import("read-excel-file/browser");
      const result = parseTaskSheet(await readSheet(file) as Parameters<typeof parseTaskSheet>[0], members);
      setRows(result.rows);
      if (result.error) setError(result.error);
    } catch {
      setError("Excelファイル(.xlsx)として読み込めませんでした。古い形式(.xls)の場合は .xlsx で保存し直してください");
    }
  };

  const downloadTemplate = async () => {
    const { default: writeXlsxFile } = await import("write-excel-file/browser");
    await writeXlsxFile([
      TEMPLATE_HEADERS.map(value => ({ value, fontWeight: "bold" as const })),
      ["資料を作成する", "未着手", "中", "", "", "", "", "", members[0]?.name ?? ""].map(value => ({ value })),
    ], { columns: TEMPLATE_HEADERS.map((_, i) => ({ width: i === 0 ? 40 : 14 })) }).toFile("タスク一覧テンプレート.xlsx");
  };

  const submit = async () => {
    if (!canImport) return;
    setImporting(true);
    setError(null);
    try {
      await onImport(projectId, rows.map(toRequestBody));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setImporting(false);
    }
  };

  return (
    <Modal title="Excelからタスクを取り込む" onClose={onClose} wide>
      <div className="space-y-4">
        <Field label="登録先の案件">
          <select value={projectId} onChange={e => setProjectId(e.target.value)} className={selectClass}>
            <ProjectOptions projects={projects} noProjectLabel="案件外(問い合わせ対応など)" />
          </select>
        </Field>

        <Field label="Excelファイル">
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ""; }} />
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) readFile(f); }}
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 hover:border-slate-500 hover:bg-slate-50"
          >
            <FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-600" />
            <span className="truncate">{fileName || "クリックしてファイルを選ぶか、ここにドロップ(.xlsx)"}</span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
            1枚目のシートを読み込みます。見出し行に「{TEMPLATE_HEADERS[0]}」(必須)のほか {TEMPLATE_HEADERS.slice(1).join("・")} の列を置けます(列の順番は自由、空欄は未設定)。
            <button onClick={downloadTemplate} className="ml-1 inline-flex items-center gap-0.5 font-medium text-slate-600 underline hover:text-slate-900"><Download className="h-3 w-3" />テンプレート</button>
          </p>
        </Field>

        {error && (
          <p className="flex items-start gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>
        )}

        {rows.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-500">
              {rows.length}件
              {errorCount > 0 && <span className="ml-2 text-red-600">{errorCount}件に問題があります。Excelを直して読み込み直してください</span>}
            </p>
            <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                  <tr>{["行", "タスク名", "担当者", "進捗", "優先度", "開始日", "期限", "繰り返し"].map(h => <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(r => (
                    <tr key={r.row} className={r.errors.length ? "bg-red-50/60" : ""}>
                      <td className="px-3 py-2 text-slate-400">{r.row}</td>
                      <td className="px-3 py-2">
                        <span className="text-slate-800">{r.title || "—"}</span>
                        {r.errors.map(e => <p key={e} className="mt-0.5 text-[11px] text-red-600">{e}</p>)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-500">{members.find(m => m.id === r.assigneeId)?.name ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-500">{r.status ?? "未着手"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-500">{r.priority ?? "中"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-500">{r.startDate || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-500">{r.due || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-500">{repeatLabel[r.repeat] ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-2">
        <Button onClick={submit} disabled={!canImport} className="flex-1 rounded-xl bg-slate-900">
          <Upload className="mr-1 h-4 w-4" />{importing ? "登録しています…" : rows.length > 0 ? `${rows.length}件を登録` : "登録"}
        </Button>
        <Button onClick={onClose} variant="outline" className="rounded-xl">閉じる</Button>
      </div>
    </Modal>
  );
}
