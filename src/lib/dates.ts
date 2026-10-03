import type { RepeatRule, Task } from "@/types";

export const DAY_MS = 86400000;

// ローカル時刻基準のYYYY-MM-DD。UTC変換だと日本時間の夜に前日扱いになるため。
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const daysBetween = (fromISO: string, toISO: string) =>
  Math.round((new Date(`${toISO}T00:00:00Z`).getTime() - new Date(`${fromISO}T00:00:00Z`).getTime()) / DAY_MS);

export const shiftISO = (iso: string, days: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);

// 短い日付表示(YYYY-MM-DD → M/D)
export const shortDate = (iso: string) => { const [, m, d] = iso.split("-"); return `${Number(m)}/${Number(d)}`; };

// 「今日の作業」は期限が今日以前(期限切れを含む)のタスク。期限なしは対象外。
export const isDueByToday = (t: Task) => !!t.due && t.due <= todayISO();

// 期限を基準に次回の日付を出す。曜日や日付は元の期限から引き継ぐ。
export const nextRepeatDate = (iso: string, rule: RepeatRule) => {
  if (!iso || !rule) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  if (rule === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (rule === "weekday") { do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6); }
  else if (rule === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (rule === "monthly") {
    // 月末の期限は翌月も月末にする。それ以外で翌月に無い日は、その月の末日に寄せる。
    const day = d.getUTCDate();
    const lastOfThisMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    const isEndOfMonth = day === lastOfThisMonth;
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(isEndOfMonth ? lastDay : Math.min(day, lastDay));
  } else return "";
  return d.toISOString().slice(0, 10);
};

// 期限のクイック選択(今日からの日数)
export const DUE_SHORTCUTS = [["今日", 0], ["明日", 1], ["来週", 7]] as const;

// 期限を過ぎてから完了した場合は、今日以降になるまで送る
export const nextRepeatDateFromToday = (iso: string, rule: RepeatRule) => {
  let next = nextRepeatDate(iso, rule);
  const today = todayISO();
  for (let i = 0; next && next < today && i < 500; i++) next = nextRepeatDate(next, rule);
  return next;
};

// 繰り返し設定時の説明。期限がないと次回分を作れない。
export function repeatHint(due: string, repeat: RepeatRule) {
  if (!repeat) return null;
  return due ? `完了すると ${nextRepeatDateFromToday(due, repeat)} の分を自動で作成します` : "期限を設定すると、完了時に次回分が作られます";
}
