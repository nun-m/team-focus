import { Fragment, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsRight, ChevronsUpDown, ListPlus, Plus, UserPlus } from "lucide-react";
import { Popover } from "radix-ui";
import { Card, CardContent } from "@/components/ui/card";
import { NO_PROJECT_ID, projectColor, taskBarColor } from "@/lib/constants";
import { daysBetween, shiftISO, shortDate, todayISO } from "@/lib/dates";
import type { Member, Project, Task } from "@/types";
import { AssigneePicker, MemberAvatar } from "./Members";
import { popoverClass } from "./OptionPicker";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const RANGE_OPTIONS = [2, 4, 8] as const;
type WorkloadMode = "task" | "project";
type ProjectGrouping = "member" | "project";
// 案件単位で、案件が少なくても最低限見せる今日以降の週数
const PROJECT_MIN_WEEKS = 12;
// 案件単位の表示期間の選択肢(週数)。nullは全期間
const PROJECT_RANGE_OPTIONS = [[13, "3ヶ月"], [26, "半年"], [52, "1年"], [null, "全期間"]] as const;
// 表示期間として絞り込める最短の週数
const PROJECT_MIN_VIEW = 4;
// 名前の列の幅。見出しの右端をドラッグして変えられ、ブラウザーごとに覚える
const NAME_COL_DEFAULT = 220;
const NAME_COL_MIN = 140;
const NAME_COL_MAX = 640;
const NAME_COL_KEY = "teamFocus.workloadNameCol";
const RIGHT_COL = 64;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const dayOfWeek = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const mondayOf = (iso: string) => shiftISO(iso, -((dayOfWeek(iso) + 6) % 7));
// 1か月前の同じ日。前月に無い日(3/31など)は前月の末日にする
const monthBefore = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 2, Math.min(d, lastDay))).toISOString().slice(0, 10);
};

// 1日あたりの担当タスク数に応じた色。0件は「空き」
const loadClass = (n: number) =>
  n === 0 ? "bg-emerald-50 text-emerald-600" : n === 1 ? "bg-blue-100 text-blue-700" : n === 2 ? "bg-blue-300 text-blue-950" : "bg-blue-600 text-white";

interface Span {
  start: string;
  end: string;
}

// タスクが稼働を占める期間。開始日・期限の片方だけなら、その1日とみなす。
// 未完了で期限を過ぎたタスクは、まだ手を取られているので今日まで伸ばす。
const taskSpan = (t: Task, today: string): (Span & { overdue: boolean }) | null => {
  const start = t.startDate || t.due;
  if (!start) return null;
  let end = t.due || t.startDate;
  if (end < start) end = start;
  const overdue = !!t.due && t.due < today;
  return { start, end: overdue && end < today ? today : end, overdue };
};

const projectSpan = (p: Project): Span | null => {
  if (!p.startDate || !p.due) return null;
  return { start: p.startDate, end: p.due < p.startDate ? p.startDate : p.due };
};

interface Column extends Span {
  key: string;
  top: string;
  bottom: string;
  boundary: boolean;
}

const overlaps = (span: Span | null, range: Span) => !!span && span.start <= range.end && range.start <= span.end;

// 表示している列の中で、期間が掛かる最初と最後の列。掛からなければnull
const columnRange = (columns: Column[], span: Span) => {
  const first = columns.findIndex(c => c.end >= span.start);
  if (first < 0 || columns[first].start > span.end) return null;
  let last = first;
  while (last + 1 < columns.length && columns[last + 1].start <= span.end) last += 1;
  return { first, last };
};

interface RowData {
  key: string;
  member: Member | undefined;
  tasks: { task: Task; span: ReturnType<typeof taskSpan> }[];
  projects: Project[];
}

interface AssignPickerProps {
  project: Project;
  rows: RowData[];
  // ボタンに添える文字(省略時はアイコンだけ)
  label?: string;
  onAssign: (memberId: string) => void;
}

// 未割当の案件の担当候補。案件の期間に各メンバーが抱えている案件を週ごとに並べ、空いている順に選べるようにする。
function AssignPicker({ project, rows, label, onAssign }: AssignPickerProps) {
  const [open, setOpen] = useState(false);
  const span = projectSpan(project);
  const weeks: Span[] = [];
  if (span) for (let monday = mondayOf(span.start); monday <= span.end; monday = shiftISO(monday, 7)) weeks.push({ start: monday, end: shiftISO(monday, 6) });
  // 期間が決まっていない案件は比べる週がないので、担当案件の少ない順にする
  const candidates = rows.filter(r => r.member).map(r => {
    const busy = span ? r.projects.filter(p => overlaps(projectSpan(p), span)) : r.projects;
    const loads = weeks.map(w => busy.filter(p => overlaps(projectSpan(p), w)).length);
    return { member: r.member!, busy, loads, free: loads.filter(n => n === 0).length };
  }).sort((a, b) => b.free - a.free || a.busy.length - b.busy.length);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button title="担当候補を見て割り当てる" className="flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-rose-500 hover:bg-rose-50">
          <UserPlus className="h-3.5 w-3.5" />{label}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="start" sideOffset={6} collisionPadding={12} className={`max-h-96 w-80 overflow-y-auto py-2 ${popoverClass}`}>
          <div className="px-3 pb-2">
            <p className="truncate text-xs font-semibold text-slate-700" title={project.name}>{project.name} の担当候補</p>
            <p className="mt-0.5 text-[10px] text-slate-400">
              {span ? `${span.start} 〜 ${span.end}(${weeks.length}週)に空きが多い順。押すと担当にします` : "開始日・期限が未設定のため、担当案件が少ない順。押すと担当にします"}
            </p>
          </div>
          {candidates.map(({ member, busy, loads, free }) => (
            <button
              key={member.id}
              onClick={() => { setOpen(false); onAssign(member.id); }}
              title={busy.length ? `${span ? "この期間に重なる案件" : "担当案件"}:\n${busy.map(p => `・${p.name}`).join("\n")}` : span ? "この期間に重なる案件はありません" : "担当案件はありません"}
              className="block w-full px-3 py-1.5 text-left hover:bg-slate-50"
            >
              <span className="flex items-center gap-2">
                <MemberAvatar member={member} title="" />
                <span className="truncate text-xs font-medium text-slate-700">{member.name}</span>
                <span className="ml-auto shrink-0 text-[11px] text-slate-500">
                  {span && <span className={free > 0 ? "font-semibold text-emerald-600" : ""}>空き {free}/{weeks.length}週</span>}
                  <span className="ml-1.5">{span ? "重なる案件" : "担当案件"} {busy.length}</span>
                </span>
              </span>
              {span && (
                <span className="mt-1 flex h-2 gap-px pl-8">
                  {loads.map((n, i) => <span key={i} className={`flex-1 rounded-sm ${loadClass(n)}`} />)}
                </span>
              )}
            </button>
          ))}
          {candidates.length === 0 && <p className="px-3 py-1.5 text-[11px] text-slate-400">メンバーが未登録です</p>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface WeekBrushProps {
  weeks: Column[];
  first: number;
  count: number;
  lanes: { key: string; first: number; last: number; color: string }[];
  todayIndex: number;
  onChange: (first: number, count: number) => void;
}

// 案件単位の全期間を俯瞰するミニマップ。枠をドラッグで移動、両端のつまみで伸縮、枠の外を押すとそこへ移動する。
function WeekBrush({ weeks, first, count, lanes, todayIndex, onChange }: WeekBrushProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const n = weeks.length;
  const pct = (i: number) => (i / n) * 100;
  const laneH = 36 / Math.max(lanes.length, 1);

  const startDrag = (e: React.PointerEvent, kind: "move" | "left" | "right", f0 = first, c0 = count) => {
    e.preventDefault();
    e.stopPropagation();
    const width = trackRef.current?.getBoundingClientRect().width || 1;
    const x0 = e.clientX;
    const onMove = (ev: PointerEvent) => {
      const d = Math.round(((ev.clientX - x0) / width) * n);
      if (kind === "move") onChange(clamp(f0 + d, 0, n - c0), c0);
      else if (kind === "left") { const f = clamp(f0 + d, 0, f0 + c0 - PROJECT_MIN_VIEW); onChange(f, f0 + c0 - f); }
      else onChange(f0, clamp(c0 + d, PROJECT_MIN_VIEW, n - f0));
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // 枠の外を押したら、そこが中心になるよう枠を移し、そのままドラッグを続けられる
  const jumpTo = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const f = clamp(Math.round(((e.clientX - rect.left) / rect.width) * n - count / 2), 0, n - count);
    onChange(f, count);
    startDrag(e, "move", f, count);
  };

  const last = first + count - 1;
  return (
    <div className="mt-4 select-none rounded-xl bg-slate-50 p-3">
      <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
        <span>{weeks[0].start}</span>
        <span className="font-semibold text-slate-500">表示期間 {weeks[first].start} 〜 {weeks[last].end}({count}週)</span>
        <span>{weeks[n - 1].end}</span>
      </div>
      <div ref={trackRef} onPointerDown={jumpTo} className="relative h-9 cursor-pointer" title="枠をドラッグで移動、両端をドラッグで期間を伸縮、枠の外をクリックでその位置へ移動">
        <div className="absolute inset-0 overflow-hidden rounded-md bg-white">
          {weeks.map((w, i) => w.boundary && i > 0 && <span key={w.key} className="absolute inset-y-0 w-px bg-slate-100" style={{ left: `${pct(i)}%` }} />)}
          {lanes.map((l, i) => (
            <span key={l.key} className={`absolute rounded-full ${l.color}`} style={{ left: `${pct(l.first)}%`, width: `${Math.max(pct(l.last - l.first + 1), 0.5)}%`, top: `${i * laneH + laneH / 2 - 1.5}px`, height: "3px" }} />
          ))}
          {todayIndex >= 0 && <span className="absolute inset-y-0 w-px bg-red-400" style={{ left: `${pct(todayIndex + 0.5)}%` }} />}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 rounded-l-md bg-slate-900/10" style={{ width: `${pct(first)}%` }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 rounded-r-md bg-slate-900/10" style={{ width: `${100 - pct(first + count)}%` }} />
        <div onPointerDown={e => startDrag(e, "move")} className="absolute inset-y-0 cursor-grab rounded-md border-2 border-slate-900 active:cursor-grabbing" style={{ left: `${pct(first)}%`, width: `${pct(count)}%` }}>
          <span onPointerDown={e => startDrag(e, "left")} title="ドラッグで開始を変更" className="absolute inset-y-0 -left-2 w-4 cursor-ew-resize"><span className="absolute inset-y-1.5 left-1.5 w-1 rounded bg-slate-900" /></span>
          <span onPointerDown={e => startDrag(e, "right")} title="ドラッグで終了を変更" className="absolute inset-y-0 -right-2 w-4 cursor-ew-resize"><span className="absolute inset-y-1.5 left-1.5 w-1 rounded bg-slate-900" /></span>
        </div>
      </div>
    </div>
  );
}

interface TeamWorkloadProps {
  members: Member[];
  projects: Project[];
  tasks: Task[];
  onPatchTask: (id: string, fields: Partial<Task>) => void;
  onEditTask: (id: string) => void;
  onShowMemberTasks: (memberId: string) => void;
  onAddMember: () => void;
  onAddProject: (memberId: string) => void;
  onAssignProject: (projectId: string, memberId: string) => void;
  onEditProject: (projectId: string) => void;
  // memberIdは担当者の初期値(空なら未割当)
  onAddTask: (projectId: string, memberId: string) => void;
}

// メンバー × 日(タスク単位)/週(案件単位)の稼働表。いつ誰が何を抱えているか、空いているのはどこかを見る。
export function TeamWorkload({ members, projects, tasks, onPatchTask, onEditTask, onShowMemberTasks, onAddMember, onAddProject, onAssignProject, onEditProject, onAddTask }: TeamWorkloadProps) {
  const today = todayISO();
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [weeks, setWeeks] = useState<(typeof RANGE_OPTIONS)[number]>(4);
  const [mode, setMode] = useState<WorkloadMode>("project");
  const [grouping, setGrouping] = useState<ProjectGrouping>("member");
  const byProject = mode === "project" && grouping === "project";
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // 案件単位の表示期間(開始週の月曜と週数)。nullは全期間。最初は1か月前から最後まで
  const [projectRange, setProjectRange] = useState<{ start: string; weeks: number } | null>(() => ({ start: mondayOf(monthBefore(today)), weeks: Infinity }));
  const chartRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const [nameCol, setNameCol] = useState(() => {
    const saved = Number(localStorage.getItem(NAME_COL_KEY));
    return saved ? clamp(saved, NAME_COL_MIN, NAME_COL_MAX) : NAME_COL_DEFAULT;
  });
  const saveNameCol = (width: number) => { setNameCol(width); localStorage.setItem(NAME_COL_KEY, String(width)); };
  const startNameResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    let width = nameCol;
    const onMove = (ev: PointerEvent) => { width = clamp(nameCol + ev.clientX - x0, NAME_COL_MIN, NAME_COL_MAX); setNameCol(width); };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); saveNameCol(width); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const projectName = (id: string) => (id === NO_PROJECT_ID ? "案件外" : projectById.get(id)?.name ?? "");
  const activeProjects = useMemo(() => projects.filter(p => p.status !== "完了" && p.id !== NO_PROJECT_ID), [projects]);

  // 案件単位で選べる週の全体(進行中の案件の全期間)。表示期間はこの中から切り出す
  const allWeeks: Column[] = useMemo(() => {
    const list: Column[] = [];
    const spans = activeProjects.map(projectSpan).filter((s): s is Span => !!s);
    // 案件がなくても1か月前からは並べる
    const first = mondayOf(spans.reduce((min, s) => (s.start < min ? s.start : min), monthBefore(today)));
    const last = spans.reduce((max, s) => (s.end > max ? s.end : max), shiftISO(today, 7 * PROJECT_MIN_WEEKS));
    for (let monday = first; monday <= last; monday = shiftISO(monday, 7)) {
      const month = Number(monday.slice(5, 7));
      const newMonth = list.length === 0 || Number(list[list.length - 1].start.slice(5, 7)) !== month;
      list.push({
        key: monday,
        start: monday,
        end: shiftISO(monday, 6),
        top: newMonth ? (list.length === 0 || month === 1 ? `${monday.slice(0, 4)}/${month}月` : `${month}月`) : "",
        bottom: String(Number(monday.slice(8))),
        boundary: newMonth,
      });
    }
    return list;
  }, [activeProjects, today]);

  // 表示する週の範囲(allWeeksの添字)。案件の増減で全体が変わってもはみ出さないよう詰める
  const view = useMemo(() => {
    const total = allWeeks.length;
    if (!projectRange) return { first: 0, count: total };
    const minCount = Math.min(PROJECT_MIN_VIEW, total);
    const first = clamp(Math.round(daysBetween(allWeeks[0].start, projectRange.start) / 7), 0, total - minCount);
    return { first, count: clamp(projectRange.weeks, minCount, total - first) };
  }, [allWeeks, projectRange]);
  const setView = (first: number, count: number) =>
    setProjectRange(count >= allWeeks.length ? null : { start: allWeeks[first].start, weeks: count });
  const todayWeek = allWeeks.findIndex(c => c.start <= today && today <= c.end);
  // 1か月前の週から始まるように表示期間を置く
  const monthAgoWeek = Math.max(allWeeks.findIndex(c => c.end >= monthBefore(today)), 0);
  const showFromMonthAgo = (count: number) => setView(clamp(monthAgoWeek, 0, allWeeks.length - count), count);
  const shiftView = (delta: number) => setView(clamp(view.first + delta, 0, allWeeks.length - view.count), view.count);

  // タスク単位は表示期間の平日ごと、案件単位は選んだ表示期間を週ごとに並べる
  const columns: Column[] = useMemo(() => {
    if (mode === "project") {
      const list = allWeeks.slice(view.first, view.first + view.count);
      // 途中から切り出したときも、先頭の列に年月を出す
      if (view.first > 0) {
        const s = list[0].start;
        list[0] = { ...list[0], top: `${s.slice(0, 4)}/${Number(s.slice(5, 7))}月`, boundary: true };
      }
      return list;
    }
    const list: Column[] = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = shiftISO(weekStart, i);
      const w = dayOfWeek(d);
      if (w === 0 || w === 6) continue;
      list.push({ key: d, start: d, end: d, top: w === 1 || list.length === 0 ? shortDate(d) : String(Number(d.slice(8))), bottom: WEEKDAY_LABELS[w], boundary: w === 1 });
    }
    return list;
  }, [mode, weekStart, weeks, allWeeks, view]);

  // 案件単位で期間を絞っているときは、表をつかんで左右にドラッグすると表示期間がずれる
  const canPan = mode === "project" && view.count < allWeeks.length;
  const startPan = (e: React.PointerEvent) => {
    if (!canPan || e.button !== 0 || (e.target as Element).closest("[data-no-pan]")) return;
    const colPx = ((chartRef.current?.offsetWidth ?? 0) - nameCol - RIGHT_COL) / columns.length;
    if (colPx <= 0) return;
    const x0 = e.clientX;
    const { first, count } = view;
    const onMove = (ev: PointerEvent) => setView(clamp(first - Math.round((ev.clientX - x0) / colPx), 0, allWeeks.length - count), count);
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const rows: RowData[] = useMemo(() => {
    const open = tasks.filter(t => t.status !== "完了");
    const memberIds = new Set(members.map(m => m.id));
    const toRow = (key: string, member: Member | undefined, list: Task[]): RowData => ({
      key,
      member,
      tasks: list.map(task => ({ task, span: taskSpan(task, today) })),
      projects: member
        ? activeProjects.filter(p => p.memberIds.includes(member.id))
        : activeProjects.filter(p => !p.memberIds.some(id => memberIds.has(id))),
    });
    return [
      ...members.map(m => toRow(m.id, m, open.filter(t => t.assigneeId === m.id))),
      // 削除済みのメンバーを指すタスクも未割当として扱う
      toRow("", undefined, open.filter(t => !t.assigneeId || !memberIds.has(t.assigneeId))),
    ];
  }, [members, activeProjects, tasks, today]);

  const tasksIn = (row: RowData, range: Span) => row.tasks.filter(({ span }) => overlaps(span, range));
  const projectsIn = (row: RowData, range: Span) => row.projects.filter(p => overlaps(projectSpan(p), range));
  const loadIn = (row: RowData, range: Span) => (mode === "task" ? tasksIn(row, range) : projectsIn(row, range)).length;

  const todaySpan = { start: today, end: today };
  const futureColumns = columns.filter(c => c.end >= today);
  const freeToday = rows.filter(r => r.member && loadIn(r, todaySpan) === 0).map(r => r.member!);
  const todayIndex = columns.findIndex(c => overlaps(c, todaySpan));
  // 週の列の中での今日の位置。案件単位のバーに今日の線を引く
  const todayLeft = mode === "project" && todayIndex >= 0
    ? ((todayIndex + (daysBetween(columns[todayIndex].start, today) + 0.5) / 7) / columns.length) * 100
    : null;

  const toggle = (key: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // メンバー行の開閉。タスク単位は最初は閉じていて開いた行を覚え、案件単位は最初から開いていて閉じた行を覚える
  const rowOpenKey = (row: RowData) => (mode === "task" ? row.key : `closed-${row.key}`);
  const isRowOpen = (row: RowData) => expanded.has(rowOpenKey(row)) === (mode === "task");
  const anyRowOpen = rows.some(isRowOpen);
  const setAllRowsOpen = (open: boolean) => setExpanded(prev => {
    const next = new Set(prev);
    for (const row of rows) {
      if (open === (mode === "task")) next.add(rowOpenKey(row)); else next.delete(rowOpenKey(row));
    }
    return next;
  });

  const colWidth = mode === "task" ? 26 : 28;
  const gridStyle = { gridTemplateColumns: `${nameCol}px repeat(${columns.length}, minmax(${colWidth}px, 1fr)) ${RIGHT_COL}px` };
  const minWidth = nameCol + RIGHT_COL + columns.length * colWidth;
  const navButton = "rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30";
  // 横にスクロールしても名前の列は左に固定して見せる
  const stickyName = "sticky left-0 z-10 flex items-center self-stretch";

  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const sortedProjects = useMemo(
    () => [...activeProjects].sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999")),
    [activeProjects],
  );

  // 案件ごとの未完了タスク(開始が早い順)。案件名の横のボタンで下に展開する
  const openTasksByProject = useMemo(() => {
    const map = new Map<string, RowData["tasks"]>();
    for (const task of tasks) {
      if (task.status === "完了") continue;
      const list = map.get(task.projectId) ?? [];
      list.push({ task, span: taskSpan(task, today) });
      map.set(task.projectId, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.span?.start ?? "9999").localeCompare(b.span?.start ?? "9999"));
    return map;
  }, [tasks, today]);

  // バーの行(案件・タスク共通)。nestedはメンバー行や案件の下に展開する行、deepはさらにその下の行
  const barRow = (
    key: string, label: React.ReactNode, span: Span | null, barClass: string, barText: string, tooltip: string,
    { onClick, right, nested = true, deep = false }: { onClick?: () => void; right?: React.ReactNode; nested?: boolean; deep?: boolean } = {},
  ) => {
    const range = span && columnRange(columns, span);
    return (
      <div key={key} className={`grid items-center ${nested ? "" : "border-b border-slate-100 py-1"}`} style={gridStyle}>
        <div data-no-pan className={`${stickyName} min-w-0 gap-2 pr-2 ${nested ? `bg-slate-50 py-1 ${deep ? "pl-14" : "pl-9"}` : "bg-white"}`}>{label}</div>
        <div className="relative h-7" style={{ gridColumn: `2 / span ${columns.length}` }}>
          {todayLeft !== null && <span className="pointer-events-none absolute inset-y-0 w-px bg-red-400" style={{ left: `${todayLeft}%` }} />}
          {range ? (
            <button
              onClick={onClick}
              // 押せるバーは、表をつかんで動かす操作の対象から外す(動かしたあとに押した扱いにならないように)
              data-no-pan={onClick ? "" : undefined}
              title={tooltip}
              className={`absolute top-1 bottom-1 flex items-center overflow-hidden rounded-md px-1.5 text-[11px] font-medium text-white ${barClass}`}
              style={{ left: `${(range.first / columns.length) * 100}%`, width: `${((range.last - range.first + 1) / columns.length) * 100}%` }}
            >
              <span className="truncate">{barText}</span>
            </button>
          ) : (
            <span className="flex h-full items-center text-[11px] text-slate-400">{span ? "表示期間外" : "開始日・期限が未設定"}</span>
          )}
        </div>
        <div className="text-right text-xs text-slate-500">{right}</div>
      </div>
    );
  };

  const taskBarRow = (key: string, { task, span }: RowData["tasks"][number], deep = false) => barRow(
    key,
    <>
      <AssigneePicker members={members} value={task.assigneeId} onChange={assigneeId => onPatchTask(task.id, { assigneeId })} />
      <button onClick={() => onEditTask(task.id)} title={`${task.title}(${projectName(task.projectId)})\nクリックで編集`} className="truncate text-left text-xs hover:underline">{task.title}</button>
    </>,
    span,
    `${taskBarColor[task.status] || "bg-slate-400"} ${span?.overdue ? "ring-2 ring-red-500" : ""}`,
    `${task.status} ${projectName(task.projectId)}`,
    `${task.title}\n${projectName(task.projectId)}\n${task.startDate || "開始日未設定"} 〜 ${task.due || "期限未設定"}\n${task.status}${span?.overdue ? "\n期限切れ(今日まで計上)" : ""}`,
    { onClick: () => onEditTask(task.id), deep },
  );

  // 案件名の横に置く、その案件のタスクを下に展開するボタン(数字は未完了タスクの件数)
  const projectTasksToggle = (key: string, projectId: string) => {
    const isOpen = expanded.has(key);
    return (
      <button onClick={() => toggle(key)} title={isOpen ? "タスクを閉じる" : "この案件の未完了タスクを下に表示"} className="flex shrink-0 items-center rounded px-0.5 text-[10px] font-medium text-slate-400 hover:bg-slate-200 hover:text-slate-600">
        <ChevronDown className={`h-3.5 w-3.5 transition ${isOpen ? "" : "-rotate-90"}`} />{openTasksByProject.get(projectId)?.length ?? 0}
      </button>
    );
  };

  // 案件名の横に置く、その案件にタスクを追加するボタン。展開できる案件は、追加したタスクが見えるよう開いておく
  const addTaskButton = (projectId: string, memberId: string, tasksKey?: string) => (
    <button
      onClick={() => { if (tasksKey) setExpanded(prev => new Set(prev).add(tasksKey)); onAddTask(projectId, memberId); }}
      title="この案件にタスクを追加"
      className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
    >
      <ListPlus className="h-3.5 w-3.5" />
    </button>
  );

  const projectTaskRows = (key: string, projectId: string, deep = false) => {
    if (!expanded.has(key)) return [];
    const list = openTasksByProject.get(projectId) ?? [];
    if (list.length === 0) return [<p key={`${key}-none`} className={`py-1.5 text-xs text-slate-400 ${deep ? "pl-14" : "pl-9"}`}>未完了のタスクはありません</p>];
    return list.map(entry => taskBarRow(`${key}-${entry.task.id}`, entry, deep));
  };

  return (
    // 日付の行をページに対して固定できるよう、カードでは切り抜かない
    <Card className="overflow-visible rounded-2xl border-0 shadow-sm">
      <CardContent className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* 切り替えは見出しのすぐ右に置く。右寄せにすると、表示ごとに期間の操作の幅が違うぶん位置がずれる */}
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-2 font-bold">チーム稼働</h2>
            <div role="group" aria-label="稼働の集計単位" className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {([["task", "タスク単位"], ["project", "案件単位"]] as const).map(([value, label]) => (
                <button key={value} onClick={() => setMode(value)} aria-pressed={mode === value} className={`rounded-md px-2.5 py-1 text-xs font-medium ${mode === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{label}</button>
              ))}
            </div>
            {mode === "project" && (
              <div role="group" aria-label="案件単位の集約方法" className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                {([["member", "人集約"], ["project", "案件集約"]] as const).map(([value, label]) => (
                  <button key={value} onClick={() => setGrouping(value)} aria-pressed={grouping === value} className={`rounded-md px-2.5 py-1 text-xs font-medium ${grouping === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{label}</button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mode === "project" && (
              <>
                <button onClick={() => shiftView(-4)} disabled={view.first === 0} title="4週前へ" className={navButton}><ChevronLeft className="h-4 w-4" /></button>
                <button onClick={() => setProjectRange({ start: allWeeks[monthAgoWeek].start, weeks: view.count === allWeeks.length ? Infinity : view.count })} title="1か月前からの表示に戻す" className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200">今日</button>
                <button onClick={() => shiftView(4)} disabled={view.first + view.count >= allWeeks.length} title="4週先へ" className={navButton}><ChevronRight className="h-4 w-4" /></button>
                <div role="group" aria-label="表示期間" className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                  {PROJECT_RANGE_OPTIONS.map(([w, label]) => {
                    const full = view.count === allWeeks.length;
                    const active = w === null ? full : !full && view.count === w;
                    return <button key={label} onClick={() => (w === null ? setProjectRange(null) : showFromMonthAgo(Math.min(w, allWeeks.length)))} aria-pressed={active} className={`rounded-md px-2.5 py-1 text-xs font-medium ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{label}</button>;
                  })}
                </div>
              </>
            )}
            {mode === "task" && (
              <>
                <button onClick={() => setWeekStart(shiftISO(weekStart, -7))} title="前の週" className={navButton}><ChevronLeft className="h-4 w-4" /></button>
                <button onClick={() => setWeekStart(mondayOf(today))} className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200">今週</button>
                <button onClick={() => setWeekStart(shiftISO(weekStart, 7))} title="次の週" className={navButton}><ChevronRight className="h-4 w-4" /></button>
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                  {RANGE_OPTIONS.map(w => (
                    <button key={w} onClick={() => setWeeks(w)} className={`rounded-md px-2.5 py-1 text-xs font-medium ${weeks === w ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{w}週</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        {/* 説明は長さが表示ごとに違うので、切り替えの位置が変わらないよう見出しの下の段に置く */}
        <p className="mt-1 text-xs text-slate-500">
          {mode === "task"
            ? "メンバーごとに、その日に抱えている未完了タスクの件数(平日のみ)。緑は空き。行を開くと担当案件とタスクの期間が見えます"
            : byProject
              ? "未完了の案件ごとの担当メンバーと期間(週単位)"
              : "メンバーごとに、週ごとの担当案件数と、未完了の案件の全期間(週単位)。緑は空き"}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-xs">
          <span className="font-semibold text-emerald-700">今日{mode === "task" ? "タスク" : "案件"}がないメンバー</span>
          {freeToday.length > 0
            ? freeToday.map(m => <span key={m.id} className="flex items-center gap-1 rounded-full bg-white py-0.5 pr-2.5 pl-0.5 text-slate-700 shadow-sm"><MemberAvatar member={m} />{m.name}</span>)
            : <span className="text-slate-500">いません</span>}
        </div>

        {members.length === 0 && (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">メンバーが未登録です。サイドバーの「メンバー」の歯車から登録してください。</p>
        )}

        {mode === "project" && (
          <WeekBrush
            weeks={allWeeks}
            first={view.first}
            count={view.count}
            lanes={sortedProjects.flatMap(p => {
              const span = projectSpan(p);
              const r = span && columnRange(allWeeks, span);
              return r ? [{ key: p.id, first: r.first, last: r.last, color: projectColor(p.status) }] : [];
            })}
            todayIndex={todayWeek}
            onChange={setView}
          />
        )}

        {/* 日付の行はページのスクロールに合わせてヘッダーの下に固定する。横スクロールは下の表と別の枠になるので、位置を表に合わせる */}
        <div ref={headRef} className="sticky top-[var(--header-h,57px)] z-[15] mt-4 overflow-hidden bg-white pt-2">
          <div style={{ minWidth }}>
            <div className="grid border-b border-slate-200 pb-1 text-center text-[10px] text-slate-500" style={gridStyle}>
              <div data-no-pan className={`${stickyName} gap-1 bg-white text-left text-xs font-semibold`}>
                {byProject ? "案件" : "メンバー"}
                {!byProject && <button onClick={onAddMember} title="メンバーを追加" className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><Plus className="h-4 w-4" /></button>}
                {!byProject && (
                  <button onClick={() => setAllRowsOpen(!anyRowOpen)} title={anyRowOpen ? "全メンバーを折りたたむ" : "全メンバーを展開する"} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                    {anyRowOpen ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
                  </button>
                )}
                <span onPointerDown={startNameResize} onDoubleClick={() => saveNameCol(NAME_COL_DEFAULT)} title="ドラッグで名前の列の幅を変更(ダブルクリックで元の幅)" className="group absolute inset-y-0 right-0 flex w-3 cursor-col-resize justify-center">
                  <span className="w-1 rounded bg-slate-200 group-hover:bg-slate-500" />
                </span>
              </div>
              {columns.map(col => (
                <div key={col.key} className={`whitespace-nowrap ${mode === "project" ? "pl-0.5 text-left" : ""} ${col.boundary ? "border-l border-slate-200" : ""} ${overlaps(col, todaySpan) ? "font-bold text-red-500" : ""}`}>
                  <div>{col.top || "\u00a0"}</div>
                  <div>{col.bottom}</div>
                </div>
              ))}
              {byProject
                ? <div className="text-right text-xs font-semibold">期限</div>
                : <div className="text-right text-xs font-semibold" title={`今日以降の表示期間で、${mode === "task" ? "担当タスクが無い日数" : "担当案件が無い週数"}`}>空き</div>}
            </div>
          </div>
        </div>

        <div onScroll={e => { if (headRef.current) headRef.current.scrollLeft = e.currentTarget.scrollLeft; }} className="overflow-x-auto">
          <div ref={chartRef} onPointerDown={startPan} className={canPan ? "cursor-grab select-none active:cursor-grabbing" : ""} style={{ minWidth }}>

            {byProject && sortedProjects.length === 0 && <p className="py-3 text-sm text-slate-400">未完了の案件はありません</p>}
            {byProject && sortedProjects.map(p => {
              const assigned = p.memberIds.map(id => memberById.get(id)).filter((m): m is Member => !!m);
              const tasksKey = `pt-g-${p.id}`;
              const taskRows = projectTaskRows(tasksKey, p.id);
              return <Fragment key={p.id}>{barRow(
                `g-${p.id}`,
                <>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${projectColor(p.status)}`} />
                  <div className="min-w-0">
                    <span className="flex items-center gap-1">
                      <button onClick={() => onEditProject(p.id)} title={`${p.name}\nクリックで編集`} className="block truncate text-left text-sm font-semibold hover:underline">{p.name}</button>
                      {projectTasksToggle(tasksKey, p.id)}
                      {addTaskButton(p.id, "", tasksKey)}
                    </span>
                    <span className="flex items-center gap-0.5">
                      {assigned.length > 0
                        ? assigned.map(m => <MemberAvatar key={m.id} member={m} />)
                        : <AssignPicker project={p} rows={rows} label="担当なし" onAssign={memberId => onAssignProject(p.id, memberId)} />}
                    </span>
                  </div>
                </>,
                projectSpan(p),
                projectColor(p.status),
                assigned.map(m => m.name).join("・") || p.name,
                `${p.name}\n${p.startDate || "開始日未設定"} 〜 ${p.due || "期限未設定"}\n担当: ${assigned.map(m => m.name).join("、") || "なし"}`,
                { nested: false, right: p.due ? shortDate(p.due) : "—" },
              )}{taskRows.length > 0 && <div className="border-b border-slate-100 bg-slate-50 py-1">{taskRows}</div>}</Fragment>;
            })}

            {!byProject && rows.map(row => {
              const openKey = rowOpenKey(row);
              const isOpen = isRowOpen(row);
              const count = mode === "task" ? row.tasks.length : row.projects.length;
              const undated = mode === "task" ? row.tasks.filter(t => !t.span).length : row.projects.filter(p => !projectSpan(p)).length;
              const overdue = row.tasks.filter(t => t.span?.overdue).length;
              const freeCount = futureColumns.filter(c => loadIn(row, c) === 0).length;
              if (!row.member && count === 0) return null;
              return (
                <Fragment key={row.key || "unassigned"}>
                  <div className="grid items-center border-b border-slate-100 py-1.5" style={gridStyle}>
                    <div data-no-pan className={`${stickyName} min-w-0 gap-2 bg-white pr-2`}>
                      <button onClick={() => toggle(openKey)} title={isOpen ? "閉じる" : mode === "task" ? "担当案件とタスクを表示" : "担当案件を表示"} className="rounded p-0.5 text-slate-400 hover:bg-slate-100">
                        <ChevronDown className={`h-4 w-4 transition ${isOpen ? "" : "-rotate-90"}`} />
                      </button>
                      <MemberAvatar member={row.member} size="md" />
                      <div className="min-w-0">
                        {row.member
                          ? (
                            <span className="flex items-center gap-1">
                              <button onClick={() => onShowMemberTasks(row.member!.id)} title="このメンバーのタスク一覧を開く" className="block truncate text-left text-sm font-semibold hover:underline">{row.member.name}</button>
                              <button onClick={() => onAddProject(row.member!.id)} title={`${row.member.name}を担当にして案件を追加`} className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><Plus className="h-3.5 w-3.5" /></button>
                            </span>
                          )
                          : <span className="block text-sm font-semibold text-slate-500">未割当</span>}
                        <span className="block truncate text-[10px] text-slate-400">
                          {mode === "task" ? "未完了タスク" : "担当案件"} {count}
                          {mode === "task" && overdue > 0 && <span className="ml-1 font-semibold text-red-500">期限切れ {overdue}</span>}
                          {undated > 0 && <span className="ml-1">日付なし {undated}</span>}
                        </span>
                      </div>
                    </div>
                    {columns.map(col => {
                      const colTasks = tasksIn(row, col);
                      const colProjects = projectsIn(row, col);
                      const load = mode === "task" ? colTasks.length : colProjects.length;
                      const tooltip = mode === "task"
                        ? [
                            `${col.start}(${WEEKDAY_LABELS[dayOfWeek(col.start)]}) ${row.member?.name ?? "未割当"}`,
                            colTasks.length ? colTasks.map(({ task }) => `・${task.title}(${projectName(task.projectId)})`).join("\n") : "担当タスクなし(空き)",
                            colProjects.length ? `担当案件: ${colProjects.map(p => p.name).join("、")}` : "",
                          ].filter(Boolean).join("\n")
                        : [
                            `${col.start}〜${col.end}の週 ${row.member?.name ?? "未割当"}`,
                            colProjects.length ? colProjects.map(p => `・${p.name}`).join("\n") : "担当案件なし(空き)",
                          ].join("\n");
                      return (
                        <div key={col.key} className={`px-px ${col.boundary ? "border-l border-slate-200" : ""}`}>
                          <div title={tooltip} className={`relative flex h-8 items-center justify-center rounded text-xs font-semibold ${loadClass(load)} ${col.end < today ? "opacity-40" : ""} ${overlaps(col, todaySpan) ? "ring-2 ring-red-400" : ""}`}>
                            {load > 0 ? load : ""}
                            {mode === "task" && colProjects.length > 0 && (
                              <span className="absolute inset-x-0.5 bottom-0.5 flex h-1 gap-px">
                                {colProjects.slice(0, 3).map(p => <span key={p.id} className={`flex-1 rounded-full ${projectColor(p.status)}`} />)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div className={`text-right text-sm font-bold ${row.member ? (freeCount > 0 ? "text-emerald-600" : "text-slate-400") : "text-slate-300"}`}>
                      {row.member ? `${freeCount}${mode === "task" ? "日" : "週"}` : "—"}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-b border-slate-100 bg-slate-50 py-1">
                      {sortedProjects.filter(p => row.projects.includes(p)).flatMap(p => {
                        // タスク単位ではメンバーのタスクを下に並べているので、案件ごとの展開は案件単位だけにする
                        const tasksKey = `pt-${row.key}-${p.id}`;
                        return [
                          barRow(
                            `p-${p.id}`,
                            <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${projectColor(p.status)}`} />
                              <button onClick={() => onEditProject(p.id)} title={`${p.name}\nクリックで編集`} className="truncate text-left hover:underline">{mode === "task" ? "案件: " : ""}{p.name}</button>
                              {mode === "project" && projectTasksToggle(tasksKey, p.id)}
                              {addTaskButton(p.id, row.member?.id ?? "", mode === "project" ? tasksKey : undefined)}
                              {!row.member && <AssignPicker project={p} rows={rows} onAssign={memberId => onAssignProject(p.id, memberId)} />}
                            </span>,
                            projectSpan(p),
                            `${projectColor(p.status)} ${mode === "task" ? "opacity-60" : ""}`,
                            p.name,
                            `${p.name}\n${p.startDate || "開始日未設定"} 〜 ${p.due || "期限未設定"}`,
                          ),
                          ...(mode === "project" ? projectTaskRows(tasksKey, p.id, true) : []),
                        ];
                      })}
                      {mode === "task" && [...row.tasks].sort((a, b) => (a.span?.start ?? "9999").localeCompare(b.span?.start ?? "9999")).map(entry => taskBarRow(`t-${entry.task.id}`, entry))}
                      {row.projects.length === 0 && (mode === "project" || row.tasks.length === 0) && (
                        <p className="py-2 pl-9 text-xs text-slate-400">{mode === "task" ? "担当している案件・未完了タスクはありません" : "担当している進行中の案件はありません"}</p>
                      )}
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          {!byProject && [[0, "空き"], [1, "1件"], [2, "2件"], [3, "3件以上"]].map(([n, label]) => (
            <span key={label} className="flex items-center gap-1"><span className={`h-3 w-4 rounded ${loadClass(n as number)}`} />{label}</span>
          ))}
          {mode === "task" ? (
            <>
              <span className="flex items-center gap-1"><span className="flex h-1 w-4 gap-px"><span className="flex-1 rounded-full bg-blue-500" /><span className="flex-1 rounded-full bg-amber-500" /></span>担当案件の期間</span>
              <span className="flex items-center gap-1"><ChevronsRight className="h-3 w-3" />開始日か期限の片方だけのタスクはその1日、期限切れの未完了タスクは今日まで計上</span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1"><span className="h-3 w-px bg-red-400" />今日</span>
              <span className="flex items-center gap-1"><ChevronsRight className="h-3 w-3" />開始日と期限が両方ある未完了の案件を、掛かる週すべてに計上</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
