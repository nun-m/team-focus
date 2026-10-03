import { PRIORITIES, TASK_STATUSES, repeatOptions } from "@/lib/constants";
import type { Member, Priority, RepeatRule, TaskStatus } from "@/types";

// Excelからの一括登録で受け付ける列。見出しの名前で列を探すので、列の順番や余計な列があってもよい。
// 見出しは前後の空白と「(任意)」などの括弧書きを除いて比べる。
const COLUMNS = {
  title: ["タスク名", "タスク", "タイトル", "件名", "title"],
  status: ["進捗", "ステータス", "状態", "status"],
  priority: ["優先度", "priority"],
  startDate: ["開始日", "開始", "startdate"],
  due: ["期限", "期日", "締切", "締め切り", "due"],
  repeat: ["繰り返し", "repeat"],
  link: ["参照リンク", "リンク", "link", "url"],
  // 「sharepointファイル」は以前のテンプレートの見出し
  fileLink: ["ファイルのリンク", "ファイル", "sharepointファイル", "filelink"],
  assignee: ["担当者", "担当", "assignee"],
} as const;

type Column = keyof typeof COLUMNS;

// テンプレートの見出し(各列の先頭の名前)
export const TEMPLATE_HEADERS = (Object.keys(COLUMNS) as Column[]).map(c => COLUMNS[c][0]);

export interface ImportRow {
  // Excel上の行番号(エラー表示用)
  row: number;
  title: string;
  status?: TaskStatus;
  priority?: Priority;
  startDate: string;
  due: string;
  repeat: RepeatRule;
  link: string;
  fileLink: string;
  // 担当者のメンバーID(空=未割当)。Excelではメンバー名で書く
  assigneeId: string;
  errors: string[];
}

export interface ImportResult {
  rows: ImportRow[];
  // 見つからなかった任意の列ではなく、ファイル自体の問題(タスク名の列がないなど)
  error?: string;
}

type Cell = string | number | boolean | Date | null;

const normalizeHeader = (v: Cell) => String(v ?? "").replace(/[((].*?[))]/g, "").replace(/\s/g, "").toLowerCase();

const cellText = (v: Cell) => (v instanceof Date ? "" : String(v ?? "").trim());

const pad = (n: number) => String(n).padStart(2, "0");

// Excelのシリアル値(1900年基準)をYYYY-MM-DDに。書式なしの日付セルが数値で読まれた場合に使う。
const fromSerial = (n: number) => new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);

// 日付セルはDate、文字列なら 2026/10/2・2026-10-02・2026.10.2 などを受け付ける。読めなければnull。
const toISODate = (v: Cell): string | null => {
  if (v === null || v === "") return "";
  // 日付セルはUTCの0時として読まれる
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === "number") return v > 20000 && v < 100000 ? fromSerial(v) : null;
  const m = String(v).trim().match(/^(\d{4})[/\-.年](\d{1,2})[/\-.月](\d{1,2})日?$/);
  if (!m) return String(v).trim() ? null : "";
  const iso = `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
};

// 繰り返しは画面の表示名(毎日・平日など)でも内部の値(daily など)でもよい
const toRepeat = (text: string): RepeatRule | null => {
  if (!text || text === "なし") return "";
  for (const [value, label] of repeatOptions) {
    if (text === value || text === label || text === label.replace(/[((].*?[))]/g, "")) return value;
  }
  return null;
};

export function parseTaskSheet(data: Cell[][], members: Member[]): ImportResult {
  // 見出し行は、タスク名の列がある最初の行(上に表題などがあってもよい)
  const headerIndex = data.slice(0, 20).findIndex(r => r.some(c => (COLUMNS.title as readonly string[]).includes(normalizeHeader(c))));
  if (headerIndex < 0) return { rows: [], error: `見出し行が見つかりません。「${COLUMNS.title[0]}」の列を用意してください` };

  const header = data[headerIndex].map(normalizeHeader);
  const index = Object.fromEntries((Object.keys(COLUMNS) as Column[]).map(c => [
    c, header.findIndex(h => (COLUMNS[c] as readonly string[]).includes(h)),
  ])) as Record<Column, number>;
  const get = (r: Cell[], c: Column) => (index[c] < 0 ? null : r[index[c]] ?? null);

  const rows: ImportRow[] = [];
  data.slice(headerIndex + 1).forEach((r, i) => {
    // 空行は飛ばす
    if (r.every(c => c === null || String(c).trim() === "")) return;
    const errors: string[] = [];
    const title = cellText(get(r, "title"));
    if (!title) errors.push("タスク名が空です");

    const statusText = cellText(get(r, "status"));
    const status = statusText ? (TASK_STATUSES as string[]).includes(statusText) ? statusText as TaskStatus : undefined : undefined;
    if (statusText && !status) errors.push(`進捗「${statusText}」は ${TASK_STATUSES.join("・")} のいずれかにしてください`);

    const priorityText = cellText(get(r, "priority"));
    const priority = priorityText ? (PRIORITIES as string[]).includes(priorityText) ? priorityText as Priority : undefined : undefined;
    if (priorityText && !priority) errors.push(`優先度「${priorityText}」は ${PRIORITIES.join("・")} のいずれかにしてください`);

    const startDate = toISODate(get(r, "startDate"));
    if (startDate === null) errors.push(`開始日「${String(get(r, "startDate"))}」を日付として読めません`);
    const due = toISODate(get(r, "due"));
    if (due === null) errors.push(`期限「${String(get(r, "due"))}」を日付として読めません`);

    const repeatText = cellText(get(r, "repeat"));
    const repeat = toRepeat(repeatText);
    if (repeat === null) errors.push(`繰り返し「${repeatText}」は ${repeatOptions.map(([, l]) => l).join("・")} のいずれかにしてください`);

    const link = cellText(get(r, "link"));
    const fileLink = cellText(get(r, "fileLink"));
    if (link && !/^https?:\/\//i.test(link)) errors.push("参照リンクは http:// または https:// で始まるURLにしてください");
    if (fileLink && !/^https?:\/\//i.test(fileLink)) errors.push("ファイルのリンクは http:// または https:// で始まるURLにしてください");

    const assigneeName = cellText(get(r, "assignee"));
    const assignee = assigneeName ? members.find(m => m.name === assigneeName) : undefined;
    if (assigneeName && !assignee) errors.push(`担当者「${assigneeName}」はメンバーに登録されていません`);

    rows.push({
      row: headerIndex + i + 2, title, status, priority,
      startDate: startDate ?? "", due: due ?? "", repeat: repeat ?? "",
      link, fileLink, assigneeId: assignee?.id ?? "", errors,
    });
  });

  if (rows.length === 0) return { rows, error: "登録するタスクがありません(見出し行の下に1件以上入力してください)" };
  return { rows };
}

// サーバーに送る形(エラー情報を除き、未入力の進捗・優先度は送らずサーバーの既定値に任せる)
export type ImportTaskBody = Omit<ImportRow, "errors">;
export const toRequestBody = ({ errors: _errors, ...row }: ImportRow): ImportTaskBody => row;
