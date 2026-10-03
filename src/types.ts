export type TaskStatus = "未着手" | "進行中" | "回答待ち" | "完了";
export type Priority = "高" | "中" | "低";
export type RepeatRule = "" | "daily" | "weekday" | "weekly" | "monthly";

export interface Member {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

export interface Project {
  id: string;
  name: string;
  category: string;
  status: string;
  startDate: string;
  due: string;
  next: string;
  // 実際に進行中にした日・完了にした日(未記録は空)。サーバーが進捗の変更に合わせて記録する
  startedAt: string;
  completedAt: string;
  // 担当メンバーのID
  memberIds: string[];
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  startDate: string;
  due: string;
  repeat: RepeatRule;
  link: string;
  // 共有フォルダやクラウド上の関連ファイルのURL
  fileLink: string;
  spawnedNext: boolean;
  // 担当者のメンバーID(空=未割当)
  assigneeId: string;
  // 実際に進行中にした日・完了にした日(未記録は空)。サーバーが進捗の変更に合わせて記録する
  startedAt: string;
  completedAt: string;
}

// 案件の追加・編集フォームで扱う項目
export type ProjectFields = Omit<Project, "id" | "startedAt" | "completedAt">;

// タスク編集モーダルで変えられる項目
export type TaskEditFields = Pick<Task, "title" | "projectId" | "priority" | "link" | "fileLink" | "assigneeId">;

export type MemberFields = Pick<Member, "name" | "color">;

export type View = "today" | "all" | "team";
