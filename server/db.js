import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { NO_PROJECT_ID } from '../shared/constants.js';

// 保存先は環境変数で変えられる(既定は server/team-focus.db)
const dbPath = path.resolve(process.env.TEAM_FOCUS_DB || path.join(import.meta.dirname, 'team-focus.db'));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
// 初期データは、DBファイルを新しく作ったときだけ入れる(案件を全部消した後に再起動しても復活させない)
const isNewDb = !fs.existsSync(dbPath);
export const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    sortOrder INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL,
    startDate TEXT NOT NULL DEFAULT '',
    due TEXT NOT NULL,
    next TEXT NOT NULL,
    color TEXT NOT NULL,
    startedAt TEXT NOT NULL DEFAULT '',
    completedAt TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    priority TEXT NOT NULL,
    startDate TEXT NOT NULL DEFAULT '',
    due TEXT NOT NULL,
    source TEXT NOT NULL,
    today INTEGER NOT NULL,
    mailFile TEXT NOT NULL DEFAULT '',
    repeat TEXT NOT NULL DEFAULT '',
    link TEXT NOT NULL DEFAULT '',
    fileLink TEXT NOT NULL DEFAULT '',
    spawnedNext INTEGER NOT NULL DEFAULT 0,
    startedAt TEXT NOT NULL DEFAULT '',
    completedAt TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (projectId) REFERENCES projects(id)
  );
`);

// 後から追加した列。古いDBに無ければ足す(新しいDBはCREATE TABLEの時点で持っている)。
const addColumnIfMissing = (table, column, definition) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
};
addColumnIfMissing('projects', 'startDate', "TEXT NOT NULL DEFAULT ''");
// 定周期タスクの繰り返し(空=繰り返さない)
addColumnIfMissing('tasks', 'repeat', "TEXT NOT NULL DEFAULT ''");
// ガントチャート用の開始日(未設定は空)
addColumnIfMissing('tasks', 'startDate', "TEXT NOT NULL DEFAULT ''");
// チャットのメッセージなど、外部の参照先URL
addColumnIfMissing('tasks', 'link', "TEXT NOT NULL DEFAULT ''");
// 共有フォルダやクラウド上の関連ファイルのURL
addColumnIfMissing('tasks', 'fileLink', "TEXT NOT NULL DEFAULT ''");
// 定周期タスクの次回分を作成済みか(完了の付け外しで二重に作らないため)
addColumnIfMissing('tasks', 'spawnedNext', 'INTEGER NOT NULL DEFAULT 0');
// 実際に進行中にした日・完了にした日(未記録は空)。実際にかかった期間を後から調べるために記録する。
// 予定の開始日(startDate)とは別物。
addColumnIfMissing('projects', 'startedAt', "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing('tasks', 'startedAt', "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing('projects', 'completedAt', "TEXT NOT NULL DEFAULT ''");
addColumnIfMissing('tasks', 'completedAt', "TEXT NOT NULL DEFAULT ''");
// 案件の担当メンバー(メンバーIDのJSON配列)
addColumnIfMissing('projects', 'memberIds', "TEXT NOT NULL DEFAULT '[]'");
// タスクの担当者(空=未割当)
addColumnIfMissing('tasks', 'assigneeId', "TEXT NOT NULL DEFAULT ''");

const MEMBER_COLUMNS = ['id', 'name', 'color', 'sortOrder'];
const PROJECT_COLUMNS = ['id', 'name', 'category', 'status', 'startDate', 'due', 'next', 'color', 'startedAt', 'completedAt', 'memberIds'];
// source列とtoday列は現在使っていないが、NOT NULLのため固定の値を入れておく(mailFile列も使っていない)
const TASK_COLUMNS = ['id', 'projectId', 'title', 'status', 'priority', 'startDate', 'due', 'source', 'today', 'repeat', 'link', 'fileLink', 'spawnedNext', 'startedAt', 'completedAt', 'assigneeId'];

const insertStatement = (table, columns) =>
  db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);
const insertMemberStmt = insertStatement('members', MEMBER_COLUMNS);
const insertProjectStmt = insertStatement('projects', PROJECT_COLUMNS);
const insertTaskStmt = insertStatement('tasks', TASK_COLUMNS);

// 使っていない列(source, today, mailFile)は画面に返さない
export const rowToTask = ({ source: _source, today: _today, mailFile: _mailFile, ...row }) => ({ ...row, spawnedNext: !!row.spawnedNext });

const parseIds = (json) => {
  try {
    const ids = JSON.parse(json);
    return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
};
export const rowToProject = (row) => ({ ...row, memberIds: parseIds(row.memberIds) });

export const insertMember = (fields) => {
  const sortOrder = (db.prepare('SELECT MAX(sortOrder) AS m FROM members').get().m ?? 0) + 1;
  const member = { id: crypto.randomUUID(), color: 'bg-sky-500', sortOrder, ...fields };
  insertMemberStmt.run(...MEMBER_COLUMNS.map(c => member[c]));
  return member;
};

// 省略した項目は既定値で埋めて登録し、登録した内容を返す。memberIdsはJSON文字列で受け取る。
export const insertProject = (fields) => {
  const project = { id: crypto.randomUUID(), category: '', status: '未着手', startDate: '', due: '', next: '', color: 'bg-slate-500', startedAt: '', completedAt: '', memberIds: '[]', ...fields };
  insertProjectStmt.run(...PROJECT_COLUMNS.map(c => project[c]));
  return rowToProject(project);
};

export const insertTask = (fields) => {
  const task = {
    id: crypto.randomUUID(), status: '未着手', priority: '中', startDate: '', due: '', source: 'manual',
    today: 1, repeat: '', link: '', fileLink: '', spawnedNext: 0, startedAt: '', completedAt: '', assigneeId: '', ...fields,
  };
  insertTaskStmt.run(...TASK_COLUMNS.map(c => task[c]));
  return rowToTask(task);
};

if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(NO_PROJECT_ID)) {
  insertProject({ id: NO_PROJECT_ID, name: '案件外', status: '', color: 'bg-slate-400' });
}

// 初めて起動したときに入れる、使い方を試すためのサンプル。日付は起動した日を基準にする。
if (isNewDb) {
  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const initialMembers = [
    { id: 'm1', name: '山田', color: 'bg-sky-500' },
    { id: 'm2', name: '佐藤', color: 'bg-pink-500' },
    { id: 'm3', name: '鈴木', color: 'bg-teal-500' },
  ];

  const initialProjects = [
    { id: 'p1', name: 'Webサイトのリニューアル', category: '制作', status: '進行中', startDate: day(-30), due: day(45), next: 'トップページのデザイン案を確定', color: 'bg-blue-500', memberIds: '["m1","m2"]' },
    { id: 'p2', name: '展示会の出展準備', category: 'イベント', status: '進行中', startDate: day(-10), due: day(30), next: '配布物の部数を決める', color: 'bg-violet-500', memberIds: '["m2"]' },
    { id: 'p3', name: '業務マニュアルの整備', category: '社内', status: '未着手', startDate: day(7), due: day(60), next: '目次の案を作る', color: 'bg-amber-500', memberIds: '["m3"]' },
  ];

  const initialTasks = [
    { id: 't1', projectId: 'p1', title: 'トップページの文章を見直す', status: '未着手', priority: '高', startDate: day(0), due: day(3), assigneeId: 'm1' },
    { id: 't2', projectId: 'p2', title: 'ブースのレイアウト案を比較する', status: '進行中', priority: '高', startDate: day(-2), due: day(0), assigneeId: 'm2' },
    { id: 't3', projectId: 'p3', title: '既存の手順書を集める', status: '回答待ち', priority: '中', startDate: day(7), due: day(14), assigneeId: 'm3' },
    { id: 't4', projectId: 'p1', title: '掲載する写真を選ぶ', status: '未着手', priority: '中', startDate: day(1), due: day(5), assigneeId: 'm2' },
    { id: 't5', projectId: 'p1', title: 'スマートフォンでの表示を確認する', status: '未着手', priority: '中', startDate: day(10), due: day(14) },
  ];

  initialMembers.forEach(insertMember);
  initialProjects.forEach(insertProject);
  initialTasks.forEach(insertTask);
}

export { NO_PROJECT_ID };
