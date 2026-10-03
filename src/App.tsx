import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BriefcaseBusiness, CalendarDays, CheckCircle2, Clock3, Flag, PanelLeftOpen, Search, Target, UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ImportTasksModal } from "@/components/ImportTasksModal";
import { MembersModal } from "@/components/Members";
import { NewTaskModal, type NewTaskInput } from "@/components/NewTaskModal";
import { DeleteProjectModal, ProjectFormModal } from "@/components/ProjectModals";
import { ProjectOverview } from "@/components/ProjectOverview";
import { Sidebar, type ProjectProgress, type TaskCounts } from "@/components/Sidebar";
import { TaskEditModal } from "@/components/TaskEditModal";
import { TaskRow } from "@/components/TaskRow";
import { TeamWorkload } from "@/components/TeamWorkload";
import { ApiError, requestJson } from "@/lib/api";
import { NO_PROJECT_ID, UNASSIGNED, compareProjectOrder, compareTasks, emptyProjectFields } from "@/lib/constants";
import { daysBetween, isDueByToday, nextRepeatDateFromToday, shiftISO } from "@/lib/dates";
import type { ImportTaskBody } from "@/lib/taskImport";
import type { Member, MemberFields, Project, ProjectFields, Task, TaskEditFields, View } from "@/types";

// 他のPCでの変更を取り込む間隔
const RELOAD_INTERVAL_MS = 30000;
const UNDO_TIMEOUT_MS = 6000;
// 担当者の絞り込みはブラウザーごとに覚える(自分のタスクだけ見る使い方のため)
const MEMBER_FILTER_KEY = "teamFocus.memberFilter";
// ナビゲーションバーを隠しているかどうかも、ブラウザーごとに覚える
const SIDEBAR_HIDDEN_KEY = "teamFocus.sidebarHidden";

// memberIdは稼働表のメンバー行から追加するときの、最初から担当にしておくメンバー
type ProjectFormState = { mode: "new"; memberId?: string } | { mode: "edit"; project: Project };

interface UndoState {
  message: string;
  undo: () => void;
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const withoutId = ({ id: _id, ...fields }: Project): ProjectFields => fields;

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberFilter, setMemberFilterState] = useState(() => localStorage.getItem(MEMBER_FILTER_KEY) ?? "");
  const [membersOpen, setMembersOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(() => localStorage.getItem(SIDEBAR_HIDDEN_KEY) === "1");
  const toggleSidebar = () => {
    localStorage.setItem(SIDEBAR_HIDDEN_KEY, sidebarHidden ? "0" : "1");
    setSidebarHidden(!sidebarHidden);
  };
  const [view, setView] = useState<View>("today");
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [showDoneProjects, setShowDoneProjects] = useState(false);
  // 画面上部に出すエラー。どの操作の失敗もここに集める。
  const [error, setError] = useState<string | null>(null);
  // 削除確認中のタスクID
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // タスク追加モーダルの初期案件(nullなら閉じている)
  const [newTaskProjectId, setNewTaskProjectId] = useState<string | null>(null);
  // 稼働表からタスクを追加するときの担当者の初期値(空は未割当)。nullは稼働表以外からの追加
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState<string | null>(null);
  // Excel取り込みモーダルの初期案件(nullなら閉じている)
  const [importProjectId, setImportProjectId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState<ProjectFormState | null>(null);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<Project | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);

  const showError = (e: unknown) => setError(errorMessage(e));

  const reloadAll = useCallback((initial = false) => Promise.all([
    requestJson<Member[]>("/members").then(setMembers),
    requestJson<Project[]>("/projects").then(setProjects),
    requestJson<Task[]>("/tasks").then(setTasks),
  ]).catch(() => {
    // 定期の読み直しは失敗しても次の回で取り戻せるので、起動時だけ知らせる
    if (initial) setError("データを読み込めませんでした。サーバーが起動しているか確認してください。");
  }), []);

  // 起動時に読み込み、その後は画面に戻ったときと一定間隔で読み直す(他のPCでの変更を反映する)
  useEffect(() => {
    reloadAll(true);
    const reloadIfVisible = () => { if (document.visibilityState === "visible") reloadAll(); };
    const timer = setInterval(reloadIfVisible, RELOAD_INTERVAL_MS);
    window.addEventListener("focus", reloadIfVisible);
    return () => { clearInterval(timer); window.removeEventListener("focus", reloadIfVisible); };
  }, [reloadAll]);

  // 「元に戻す」は一定時間で消す
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), UNDO_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  // --- 集計 ---

  // 「案件外」は案件一覧・集計からは除き、タスクの割り当て先としてのみ使う
  const realProjects = useMemo(() => projects.filter(p => p.id !== NO_PROJECT_ID), [projects]);
  // タスクの登録先に選べる案件(完了した案件は選択肢に出さない)
  const openProjects = useMemo(() => realProjects.filter(p => p.status !== "完了"), [realProjects]);
  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);

  const setMemberFilter = (id: string) => {
    setMemberFilterState(id);
    localStorage.setItem(MEMBER_FILTER_KEY, id);
  };
  // 削除されたメンバーを覚えていた場合は絞り込まない
  const activeMemberFilter = memberFilter === UNASSIGNED || memberById.has(memberFilter) ? memberFilter : "";
  const filterMember = memberById.get(activeMemberFilter);
  const matchesMember = useCallback((t: Task) =>
    !activeMemberFilter || (activeMemberFilter === UNASSIGNED ? !memberById.has(t.assigneeId) : t.assigneeId === activeMemberFilter),
  [activeMemberFilter, memberById]);

  const doneProjectCount = realProjects.filter(p => p.status === "完了").length;
  const listedProjects = realProjects
    .filter(p => showDoneProjects || p.status !== "完了")
    .sort((a, b) => (a.status === "完了" ? 1 : 0) - (b.status === "完了" ? 1 : 0) || compareProjectOrder(a, b));

  // サイドバーと集計カードの件数(いずれも未完了のみ、担当者の絞り込みを反映)と、案件ごとのタスク消化率・メンバーごとの未完了数を出す
  const { counts, waitingCount, projectProgress, memberOpenCounts } = useMemo(() => {
    const counts: TaskCounts = { today: 0, all: 0, noProject: 0 };
    const progress: Record<string, ProjectProgress> = {};
    const memberOpenCounts: Record<string, number> = {};
    let waitingCount = 0;
    for (const t of tasks) {
      const pr = (progress[t.projectId] ??= { total: 0, done: 0, pct: 0 });
      pr.total += 1;
      if (t.status === "完了") { pr.done += 1; continue; }
      const memberKey = memberById.has(t.assigneeId) ? t.assigneeId : UNASSIGNED;
      memberOpenCounts[memberKey] = (memberOpenCounts[memberKey] ?? 0) + 1;
      if (!matchesMember(t)) continue;
      counts.all += 1;
      if (isDueByToday(t)) counts.today += 1;
      if (t.projectId === NO_PROJECT_ID) counts.noProject += 1;
      if (t.status === "回答待ち") waitingCount += 1;
    }
    for (const pr of Object.values(progress)) pr.pct = Math.round((pr.done / pr.total) * 100);
    return { counts, waitingCount, projectProgress: progress, memberOpenCounts };
  }, [tasks, memberById, matchesMember]);

  // 今の画面(表示・案件・担当者・検索)の絞り込みに合うか。検索はタスク名・案件名・担当者名を対象にする。
  const matchesView = useCallback((t: Task) => {
    if (selectedProject && t.projectId !== selectedProject) return false;
    if (!matchesMember(t)) return false;
    if (view === "today" && !isDueByToday(t)) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const projectName = t.projectId === NO_PROJECT_ID ? "案件外" : projectById.get(t.projectId)?.name ?? "";
    const assigneeName = memberById.get(t.assigneeId)?.name ?? "";
    return [t.title, projectName, assigneeName].some(s => s.toLowerCase().includes(q));
  }, [view, selectedProject, query, projectById, memberById, matchesMember]);

  // 完了を除く前の一覧。「完了も表示」の切り替えと、隠している件数の表示に使う。
  const matchedTasks = useMemo(() => tasks.filter(matchesView), [tasks, matchesView]);
  const doneCount = matchedTasks.filter(t => t.status === "完了").length;
  const visibleTasks = useMemo(
    () => matchedTasks.filter(t => showDone || t.status !== "完了").sort(compareTasks),
    [matchedTasks, showDone],
  );

  const selected = selectedProject ? projectById.get(selectedProject) : undefined;
  const editingTask = editingTaskId ? tasks.find(t => t.id === editingTaskId) : undefined;

  // --- 画面の切り替え ---

  const selectView = (key: View) => { setView(key); setSelectedProject(null); };
  const selectProject = (id: string) => { setSelectedProject(id); setView("all"); };
  // 稼働表ではタスク一覧が見えないので、一覧に移る
  const selectMember = (id: string) => {
    setMemberFilter(id);
    if (view === "team") setView("all");
  };
  const showMemberTasks = (id: string) => {
    setMemberFilter(id);
    setSelectedProject(null);
    setView("all");
  };

  // --- タスク ---

  // 定周期タスクを完了にしたら、次回分を1件だけ作る。
  // 完了→未完了→完了と操作しても増えないよう、作成済みかはサーバーが判定する(作成済みなら409)。
  const spawnNextOccurrence = (task: Task) => {
    const due = nextRepeatDateFromToday(task.due, task.repeat);
    if (!due) return;
    const startDate = task.startDate ? shiftISO(task.startDate, daysBetween(task.due, due)) : "";
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, spawnedNext: true } : t));
    requestJson<Task>("/tasks", {
      method: "POST",
      body: { projectId: task.projectId, title: task.title, link: task.link, fileLink: task.fileLink, priority: task.priority, due, startDate, repeat: task.repeat, assigneeId: task.assigneeId, spawnedFrom: task.id },
    })
      .then(created => setTasks(prev => [...prev, created]))
      .catch(e => { if (!(e instanceof ApiError && e.status === 409)) showError(e); });
  };

  const patchTask = (id: string, fields: Partial<Task>) => {
    const before = tasks.find(t => t.id === id);
    if (!before) return;
    const completing = fields.status === "完了" && before.status !== "完了";
    if (completing && before.repeat && before.due && !before.spawnedNext) spawnNextOccurrence(before);
    // 完了にすると一覧から消えることが多いので、すぐ戻せるようにする
    if (completing) setUndo({ message: `「${before.title}」を完了にしました`, undo: () => patchTask(id, { status: before.status }) });
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t));
    requestJson<Task>(`/tasks/${id}`, { method: "PATCH", body: fields })
      .then(updated => setTasks(prev => prev.map(t => t.id === id ? updated : t)))
      .catch(e => {
        showError(e);
        setTasks(prev => prev.map(t => t.id === id ? before : t)); // 画面を保存前の状態に戻す
      });
  };

  // チェックは完了と未着手の行き来。細かい進捗はステータスのバッジから変える。
  const toggleDone = (task: Task) => patchTask(task.id, { status: task.status === "完了" ? "未着手" : "完了" });

  const saveTaskEdit = (id: string, fields: TaskEditFields) => {
    patchTask(id, fields);
    setEditingTaskId(null);
  };

  const addTask = (input: NewTaskInput): Promise<Task | null> =>
    requestJson<Task>("/tasks", { method: "POST", body: input })
      .then(created => {
        setTasks(prev => [...prev, created]);
        return created;
      })
      .catch(e => {
        showError(e);
        return null;
      });

  // 案件のタスク一覧を開いていればその案件を、そうでなければ(完了した案件を開いているときも)先頭の案件を初期値にする
  const defaultProjectId = (id = selectedProject) =>
    id && (id === NO_PROJECT_ID || openProjects.some(p => p.id === id)) ? id : openProjects[0]?.id || NO_PROJECT_ID;

  const closeNewTask = (added: Task[]) => {
    setNewTaskProjectId(null);
    // 稼働表から追加したときは、タスク一覧に移らず稼働表に残る
    if (newTaskAssigneeId === null) revealTasks(added);
    setNewTaskAssigneeId(null);
  };

  // 失敗はモーダル内に出すので、ここでは捕まえない
  const importTasks = async (projectId: string, rows: ImportTaskBody[]) => {
    const created = await requestJson<Task[]>("/tasks/import", { method: "POST", body: { projectId, tasks: rows } });
    setTasks(prev => [...prev, ...created]);
    setImportProjectId(null);
    revealTasks(created);
  };

  const revealTasks = (added: Task[]) => {
    // 追加したタスクが今の絞り込みで見えない場合は移動する(「今日の作業」は期限なしを出さないので、案件の一致だけでは判定できない)。
    // すべて同じ案件ならその案件へ、複数の案件にまたがるならすべてのタスクへ。
    if (added.length > 0 && (view === "team" || added.some(t => !matchesView(t)))) {
      const sameProject = added.every(t => t.projectId === added[0].projectId);
      setSelectedProject(sameProject ? added[0].projectId : null);
      setView("all");
      setQuery("");
      if (added.some(t => !matchesMember(t))) setMemberFilter("");
    }
  };

  const deleteTask = (id: string) => {
    const removeLocal = () => setTasks(prev => prev.filter(t => t.id !== id));
    requestJson(`/tasks/${id}`, { method: "DELETE" })
      .then(removeLocal)
      .catch(e => {
        if (e instanceof ApiError && e.status === 404) removeLocal(); // 別の画面で削除済み
        else showError(e);
      })
      .finally(() => setConfirmDelete(null));
  };

  // --- メンバー ---

  // 成功したかどうかを返し、モーダル側で入力欄を片付けるか決める
  const addMember = (fields: MemberFields) =>
    requestJson<Member>("/members", { method: "POST", body: fields })
      .then(created => { setMembers(prev => [...prev, created]); return true; })
      .catch(e => { showError(e); return false; });

  const updateMember = (id: string, fields: MemberFields) =>
    requestJson<Member>(`/members/${id}`, { method: "PATCH", body: fields })
      .then(updated => { setMembers(prev => prev.map(m => m.id === id ? updated : m)); return true; })
      .catch(e => { showError(e); return false; });

  const deleteMember = (id: string) => {
    requestJson(`/members/${id}`, { method: "DELETE" })
      .then(() => {
        setMembers(prev => prev.filter(m => m.id !== id));
        setTasks(prev => prev.map(t => t.assigneeId === id ? { ...t, assigneeId: "" } : t));
        setProjects(prev => prev.map(p => p.memberIds.includes(id) ? { ...p, memberIds: p.memberIds.filter(m => m !== id) } : p));
      })
      .catch(e => { showError(e); reloadAll(); });
  };

  // --- 案件 ---

  const changeProjectStatus = (id: string, status: string) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    requestJson<Project>(`/projects/${id}`, { method: "PATCH", body: { status } })
      .then(updated => setProjects(prev => prev.map(p => p.id === id ? updated : p)))
      .catch(e => { showError(e); reloadAll(); });
  };

  // 稼働表の担当候補から、案件の担当メンバーに1人足す
  const assignProjectMember = (id: string, memberId: string) => {
    const project = projectById.get(id);
    if (!project || project.memberIds.includes(memberId)) return;
    const memberIds = [...project.memberIds, memberId];
    setProjects(prev => prev.map(p => p.id === id ? { ...p, memberIds } : p));
    requestJson<Project>(`/projects/${id}`, { method: "PATCH", body: { memberIds } })
      .then(updated => setProjects(prev => prev.map(p => p.id === id ? updated : p)))
      .catch(e => { showError(e); reloadAll(); });
  };

  // 失敗したときに入力が消えないよう、モーダルは保存できてから閉じる
  const submitProject = (fields: ProjectFields) => {
    if (projectForm?.mode === "edit") {
      const { project } = projectForm;
      // 変わった項目だけ送る(古い版の進捗など、今は選べない値をそのまま送り返して弾かれないように)
      const changed = Object.fromEntries(Object.entries(fields).filter(([k, v]) => project[k as keyof ProjectFields] !== v));
      if (Object.keys(changed).length === 0) { setProjectForm(null); return; }
      requestJson<Project>(`/projects/${project.id}`, { method: "PATCH", body: changed })
        .then(updated => {
          setProjects(prev => prev.map(p => p.id === project.id ? updated : p));
          setProjectForm(null);
        })
        .catch(showError);
      return;
    }
    requestJson<Project>("/projects", { method: "POST", body: fields })
      .then(created => {
        setProjects(prev => [...prev, created]);
        // 稼働表から追加したときは、稼働表に残って追加された案件を見せる
        if (!projectForm?.memberId) selectProject(created.id);
        setProjectForm(null);
      })
      .catch(showError);
  };

  const removeProject = (id: string, mode: "detach" | "delete") => {
    requestJson(`/projects/${id}?tasks=${mode}`, { method: "DELETE" })
      .then(() => {
        setProjects(prev => prev.filter(p => p.id !== id));
        setTasks(prev => mode === "delete"
          ? prev.filter(t => t.projectId !== id)
          : prev.map(t => t.projectId === id ? { ...t, projectId: NO_PROJECT_ID } : t));
        if (selectedProject === id) setSelectedProject(null);
      })
      .catch(showError)
      .finally(() => setDeleteProjectTarget(null));
  };

  // --- 描画 ---

  const baseTitle = selectedProject
    ? (selectedProject === NO_PROJECT_ID ? "案件外" : selected?.name)
    : view === "today" ? "今日の作業" : "すべてのタスク";
  const listTitle = activeMemberFilter ? `${baseTitle} ・ ${filterMember?.name ?? "未割当"}` : baseTitle;

  // ヘッダーの高さ(折り返しで変わる)をCSS変数にして、サイドバーをその下に固定する
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const observer = new ResizeObserver(() => rootRef.current?.style.setProperty("--header-h", `${header.offsetHeight}px`));
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const summaryCards = [
    { label: "今日の残り", value: counts.today, Icon: CalendarDays, color: "text-blue-500", onClick: undefined },
    { label: "進行中の案件", value: realProjects.filter(p => p.status === "進行中").length, Icon: BriefcaseBusiness, color: "text-violet-500", onClick: undefined },
    { label: "回答待ち", value: waitingCount, Icon: Clock3, color: "text-amber-500", onClick: undefined },
    { label: "未割当のタスク", value: memberOpenCounts[UNASSIGNED] ?? 0, Icon: UserRound, color: "text-rose-500", onClick: () => selectMember(UNASSIGNED) },
  ];

  return (
    <div ref={rootRef} className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <header ref={headerRef} className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="flex w-full flex-wrap items-center gap-4 px-6 py-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm"><Target className="h-5 w-5" /></div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Team Focus</h1>
            <p className="text-xs text-slate-500">チームの案件・タスクと稼働を一つの場所で管理</p>
          </div>
          {/* 狭い画面では検索欄を下の段に回す(隠さない) */}
          <div className="order-last flex w-full items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 md:order-none md:ml-auto md:w-72">
            <Search className="h-4 w-4 text-slate-400" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="タスク名・案件名・担当者で検索" className="w-full bg-transparent text-sm outline-none" />
          </div>
        </div>
        {error && (
          <div className="flex items-center gap-2 border-t border-red-100 bg-red-50 px-6 py-2 text-xs text-red-700">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="underline">閉じる</button>
          </div>
        )}
      </header>

      {/* ナビゲーションバーを隠している間は、表示に戻すボタンだけを同じ位置(ロゴの下)に残し、本文を横いっぱいに広げる */}
      <main className={sidebarHidden ? "flex w-full items-start gap-3 px-6 py-6" : "grid w-full grid-cols-12 gap-6 px-6 py-6"}>
        {sidebarHidden && (
          <button onClick={toggleSidebar} title="ナビゲーションバーを表示" className="sticky top-[calc(var(--header-h,57px)+1.5rem)] shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-200">
            <PanelLeftOpen className="h-5 w-5" />
          </button>
        )}
        {!sidebarHidden && <Sidebar
          view={view}
          selectedProject={selectedProject}
          counts={counts}
          projects={listedProjects}
          progress={projectProgress}
          doneProjectCount={doneProjectCount}
          showDoneProjects={showDoneProjects}
          members={members}
          memberOpenCounts={memberOpenCounts}
          memberFilter={activeMemberFilter}
          onToggleDoneProjects={() => setShowDoneProjects(v => !v)}
          onSelectView={selectView}
          onSelectProject={selectProject}
          onNewProject={() => setProjectForm({ mode: "new" })}
          onSelectMember={selectMember}
          onManageMembers={() => setMembersOpen(true)}
          onImportTasks={() => setImportProjectId(defaultProjectId())}
          onAddTask={() => setNewTaskProjectId(defaultProjectId())}
          onHide={toggleSidebar}
        />}

        <section className={`space-y-5 ${sidebarHidden ? "min-w-0 flex-1" : "col-span-12 lg:col-span-9 2xl:col-span-10"}`}>
          {view === "team" ? (
            <TeamWorkload
              members={members}
              projects={realProjects}
              tasks={tasks}
              onPatchTask={patchTask}
              onEditTask={setEditingTaskId}
              onShowMemberTasks={showMemberTasks}
              onAddMember={() => setMembersOpen(true)}
              onAddProject={memberId => setProjectForm({ mode: "new", memberId })}
              onAssignProject={assignProjectMember}
              onAddTask={(projectId, memberId) => { setNewTaskAssigneeId(memberId); setNewTaskProjectId(defaultProjectId(projectId)); }}
              onEditProject={id => { const project = projectById.get(id); if (project) setProjectForm({ mode: "edit", project }); }}
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {summaryCards.map(({ label, value, Icon, color, onClick }) => (
                  <Card key={label} onClick={onClick} className={`rounded-2xl border-0 shadow-sm ${onClick ? "cursor-pointer hover:bg-slate-50" : ""}`}>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between"><span className="text-sm text-slate-500">{label}</span><Icon className={`h-5 w-5 ${color}`} /></div>
                      <div className="mt-2 text-3xl font-bold">{value}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {selected && selected.id !== NO_PROJECT_ID && (
                <ProjectOverview
                  project={selected}
                  progress={projectProgress[selected.id] || { total: 0, done: 0, pct: 0 }}
                  members={selected.memberIds.map(id => memberById.get(id)).filter((m): m is Member => !!m)}
                  onChangeStatus={s => changeProjectStatus(selected.id, s)}
                  onAddTask={() => setNewTaskProjectId(defaultProjectId(selected.id))}
                  onImportTasks={() => setImportProjectId(defaultProjectId(selected.id))}
                  onEdit={() => setProjectForm({ mode: "edit", project: selected })}
                  onDelete={() => setDeleteProjectTarget(selected)}
                />
              )}

              <Card className="rounded-2xl border-0 shadow-sm">
                <CardContent className="p-0">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5">
                    <div>
                      <h2 className="font-bold">{listTitle}</h2>
                      <p className="mt-0.5 text-xs text-slate-500">期限なしを先頭に、あとは期限が近い順。上から一つずつ処理</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setShowDone(v => !v)} title={showDone ? "完了したタスクを隠す" : "完了したタスクも表示する"} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${showDone ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
                        <CheckCircle2 className="h-4 w-4" />完了も表示
                        {doneCount > 0 && <span className={`rounded-full px-1.5 text-[10px] font-bold ${showDone ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>{doneCount}</span>}
                      </button>
                      <Flag className="h-5 w-5 text-slate-400" />
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {visibleTasks.map((t, i) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        project={projectById.get(t.projectId)}
                        members={members}
                        index={i}
                        confirmingDelete={confirmDelete === t.id}
                        onToggleDone={() => toggleDone(t)}
                        onPatch={fields => patchTask(t.id, fields)}
                        onEdit={() => setEditingTaskId(t.id)}
                        onAskDelete={() => setConfirmDelete(t.id)}
                        onCancelDelete={() => setConfirmDelete(null)}
                        onDelete={() => deleteTask(t.id)}
                      />
                    ))}
                    {visibleTasks.length === 0 && (
                      <div className="px-6 py-14 text-center text-sm text-slate-400">
                        該当するタスクはありません
                        {view === "today" && !selectedProject && <p className="mt-1 text-xs">期限なしのタスクは「すべてのタスク」に表示されます</p>}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </section>
      </main>

      {undo && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
          <span className="max-w-72 truncate">{undo.message}</span>
          <button onClick={() => { undo.undo(); setUndo(null); }} className="font-semibold text-emerald-300 hover:text-emerald-200">元に戻す</button>
        </div>
      )}

      {newTaskProjectId !== null && (
        <NewTaskModal projects={openProjects} members={members} initialProjectId={newTaskProjectId} initialAssigneeId={newTaskAssigneeId ?? filterMember?.id ?? ""} onAdd={addTask} onClose={closeNewTask} />
      )}

      {importProjectId !== null && (
        <ImportTasksModal projects={openProjects} members={members} initialProjectId={importProjectId} onImport={importTasks} onClose={() => setImportProjectId(null)} />
      )}

      {editingTask && (
        <TaskEditModal task={editingTask} projects={realProjects.filter(p => p.status !== "完了" || p.id === editingTask.projectId)} members={members} onSave={fields => saveTaskEdit(editingTask.id, fields)} onClose={() => setEditingTaskId(null)} />
      )}

      {membersOpen && (
        <MembersModal members={members} openTaskCounts={memberOpenCounts} onAdd={addMember} onUpdate={updateMember} onDelete={deleteMember} onClose={() => setMembersOpen(false)} />
      )}

      {projectForm && (
        <ProjectFormModal
          title={projectForm.mode === "edit" ? "案件を編集" : "案件を追加"}
          submitLabel={projectForm.mode === "edit" ? "保存する" : "追加する"}
          initial={projectForm.mode === "edit" ? withoutId(projectForm.project) : { ...emptyProjectFields(), memberIds: projectForm.memberId ? [projectForm.memberId] : [] }}
          members={members}
          onSubmit={submitProject}
          onClose={() => setProjectForm(null)}
        />
      )}

      {deleteProjectTarget && (
        <DeleteProjectModal
          project={deleteProjectTarget}
          taskCount={tasks.filter(t => t.projectId === deleteProjectTarget.id).length}
          onDelete={mode => removeProject(deleteProjectTarget.id, mode)}
          onClose={() => setDeleteProjectTarget(null)}
        />
      )}
    </div>
  );
}
