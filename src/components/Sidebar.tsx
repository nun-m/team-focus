import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, FileSpreadsheet, PanelLeftClose, Plus, Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NO_PROJECT_ID, UNASSIGNED, projectColor, selectClass } from "@/lib/constants";
import type { Member, Project, View } from "@/types";
import { MemberAvatar, MemberStack } from "./Members";

export interface ProjectProgress {
  total: number;
  done: number;
  pct: number;
}

export interface TaskCounts {
  today: number;
  all: number;
  noProject: number;
}

const NAV_ITEMS = [
  { key: "today", Icon: CalendarDays, label: "今日の作業", countTitle: "期限が今日までの未完了タスク" },
  { key: "all", Icon: CheckCircle2, label: "すべてのタスク", countTitle: "未完了タスク" },
  { key: "team", Icon: Users, label: "チーム稼働", countTitle: "" },
] as const;

interface SidebarProps {
  view: View;
  selectedProject: string | null;
  counts: TaskCounts;
  projects: Project[];
  progress: Record<string, ProjectProgress>;
  doneProjectCount: number;
  showDoneProjects: boolean;
  members: Member[];
  // メンバーごとの未完了タスク数(UNASSIGNEDは未割当)
  memberOpenCounts: Record<string, number>;
  memberFilter: string;
  onToggleDoneProjects: () => void;
  onSelectView: (view: View) => void;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onSelectMember: (id: string) => void;
  onManageMembers: () => void;
  onImportTasks: () => void;
  onAddTask: () => void;
  onHide: () => void;
}

export function Sidebar({ view, selectedProject, counts, projects, progress, doneProjectCount, showDoneProjects, members, memberOpenCounts, memberFilter, onToggleDoneProjects, onSelectView, onSelectProject, onNewProject, onSelectMember, onManageMembers, onImportTasks, onAddTask, onHide }: SidebarProps) {
  const memberById = new Map(members.map(m => [m.id, m]));
  // メンバー一覧の開閉(ブラウザに覚えておく)
  const [membersOpen, setMembersOpen] = useState(() => { try { return localStorage.getItem("sidebarMembersOpen") !== "0"; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem("sidebarMembersOpen", membersOpen ? "1" : "0"); } catch { /* 保存できなくても動作に支障なし */ } }, [membersOpen]);
  // 閉じていても絞り込み中のメンバーだけは見えるようにする
  const showMember = (id: string) => membersOpen || memberFilter === id;
  const memberButton = (active: boolean) => `flex w-full items-center gap-2.5 rounded-xl px-3 py-1.5 text-left text-sm ${active ? "bg-white font-semibold shadow-sm" : "text-slate-600 hover:bg-white"}`;

  return (
    // 広い画面ではヘッダーの下に固定し、本文とは別にスクロールする
    <aside className="col-span-12 space-y-5 lg:sticky lg:top-[calc(var(--header-h,57px)+1.5rem)] lg:col-span-3 lg:max-h-[calc(100vh-var(--header-h,57px)-3rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-1 2xl:col-span-2">
      <button onClick={onHide} title="ナビゲーションバーを隠して表示を広げる" className="mb-1 block rounded-lg p-1.5 text-slate-500 hover:bg-slate-200">
        <PanelLeftClose className="h-5 w-5" />
      </button>

      <Card className="rounded-2xl border-0 shadow-sm">
        <CardContent className="p-3">
          {NAV_ITEMS.map(({ key, Icon, label, countTitle }) => {
            const active = view === key && !selectedProject;
            return (
              <button key={key} onClick={() => onSelectView(key)} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                <Icon className="h-4 w-4" />{label}
                {key !== "team" && <span title={countTitle} className="ml-auto text-xs opacity-70">{counts[key]}</span>}
              </button>
            );
          })}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="flex gap-2">
          <Button onClick={onImportTasks} variant="outline" title="Excelのタスク一覧をまとめて登録" className="flex-1 rounded-xl px-2 text-xs"><FileSpreadsheet className="mr-1 h-4 w-4" />Excel取込</Button>
          <Button onClick={onAddTask} className="flex-1 rounded-xl bg-slate-900 px-2 text-xs"><Plus className="mr-1 h-4 w-4" />タスク追加</Button>
        </div>
        <select value={memberFilter} onChange={e => onSelectMember(e.target.value)} title="担当者で絞り込む(このブラウザーに記憶)" className={`${selectClass} py-2 ${memberFilter ? "border-slate-900 font-semibold" : ""}`}>
          <option value="">担当: 全員</option>
          {members.map(m => <option key={m.id} value={m.id}>担当: {m.name}</option>)}
          <option value={UNASSIGNED}>担当: 未割当</option>
        </select>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between px-2">
          <button onClick={() => setMembersOpen(o => !o)} title={membersOpen ? "メンバーを折りたたむ" : "メンバーを展開する"} className="flex items-center gap-1 text-slate-500 hover:text-slate-700">
            <ChevronDown className={`h-3.5 w-3.5 transition ${membersOpen ? "" : "-rotate-90"}`} />
            <h2 className="text-xs font-semibold uppercase tracking-wider">メンバー</h2>
            {!membersOpen && <span className="text-[11px] font-medium text-slate-400">{members.length}</span>}
          </button>
          <button onClick={onManageMembers} title="メンバーを登録・編集"><Settings className="h-4 w-4 text-slate-400 hover:text-slate-600" /></button>
        </div>
        <div className="space-y-0.5">
          {members.filter(m => showMember(m.id)).map(m => (
            <button key={m.id} onClick={() => onSelectMember(memberFilter === m.id ? "" : m.id)} title={memberFilter === m.id ? "絞り込みを解除" : `${m.name}のタスクだけ表示`} className={memberButton(memberFilter === m.id)}>
              <MemberAvatar member={m} title="" />
              <span className="truncate">{m.name}</span>
              <span title="未完了タスク" className="ml-auto shrink-0 text-[11px] font-medium text-slate-400">{memberOpenCounts[m.id] ?? 0}</span>
            </button>
          ))}
          {showMember(UNASSIGNED) && <button onClick={() => onSelectMember(memberFilter === UNASSIGNED ? "" : UNASSIGNED)} title={memberFilter === UNASSIGNED ? "絞り込みを解除" : "担当者が未割当のタスクだけ表示"} className={memberButton(memberFilter === UNASSIGNED)}>
            <MemberAvatar member={undefined} title="" />
            <span className="truncate text-slate-500">未割当</span>
            <span title="未完了タスク" className="ml-auto shrink-0 text-[11px] font-medium text-slate-400">{memberOpenCounts[UNASSIGNED] ?? 0}</span>
          </button>}
          {membersOpen && members.length === 0 && <button onClick={onManageMembers} className="px-3 py-1 text-xs text-slate-400 underline hover:text-slate-600">メンバーを登録する</button>}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between px-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">案件</h2>
          <div className="flex items-center gap-1">
            {doneProjectCount > 0 && (
              <button onClick={onToggleDoneProjects} title={showDoneProjects ? "完了した案件を隠す" : "完了した案件も表示する"} className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${showDoneProjects ? "bg-slate-900 text-white" : "text-slate-400 hover:bg-slate-200"}`}>
                <CheckCircle2 className="h-3.5 w-3.5" />{doneProjectCount}
              </button>
            )}
            <button onClick={onNewProject} title="案件を追加"><Plus className="h-4 w-4 text-slate-400 hover:text-slate-600" /></button>
          </div>
        </div>

        <div className="space-y-1">
          <button onClick={() => onSelectProject(NO_PROJECT_ID)} title="案件に属さないタスク(問い合わせ対応など)" className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${selectedProject === NO_PROJECT_ID ? "bg-white font-semibold shadow-sm" : "text-slate-500 hover:bg-white"}`}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-slate-400" />
            <span className="truncate">案件外</span>
            <span title="未完了タスク" className="ml-auto shrink-0 text-[11px] font-medium text-slate-400">{counts.noProject}</span>
          </button>

          {projects.map(p => {
            const pr = progress[p.id] || { total: 0, done: 0, pct: 0 };
            const pDone = p.status === "完了";
            return (
              <button key={p.id} onClick={() => onSelectProject(p.id)} title={`${p.status} ・ 完了 ${pr.done}/${pr.total}`} className={`block w-full rounded-xl px-3 py-2.5 text-left text-sm ${selectedProject === p.id ? "bg-white font-semibold shadow-sm" : "text-slate-600 hover:bg-white"} ${pDone ? "opacity-70" : ""}`}>
                <span className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${projectColor(p.status)} ${pDone ? "opacity-40" : ""}`} />
                  <span className={`truncate ${pDone ? "text-slate-400 line-through" : ""}`}>{p.name}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <MemberStack members={p.memberIds.map(id => memberById.get(id)).filter((m): m is Member => !!m)} max={3} />
                    {pDone
                      ? <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />完了</span>
                      : <span className="text-[11px] font-medium text-slate-400">{pr.pct}%</span>}
                  </span>
                </span>
                <span className={`mt-1.5 block h-1 overflow-hidden rounded-full bg-slate-200 ${pDone ? "opacity-40" : ""}`}>
                  <span className={`block h-full rounded-full ${projectColor(p.status)}`} style={{ width: `${pDone ? 100 : pr.pct}%` }} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
