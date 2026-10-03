import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, insertMember, insertProject, insertTask, rowToProject, rowToTask, NO_PROJECT_ID } from './db.js';
import { MEMBER_COLORS, PRIORITIES, PROJECT_STATUSES, REPEAT_RULES, TASK_STATUSES } from '../shared/constants.js';

// 環境ごとに変えたい設定は環境変数で上書きできる
const PORT = Number(process.env.TEAM_FOCUS_PORT || process.env.PORT) || 3002;
const HOST = process.env.TEAM_FOCUS_HOST || '0.0.0.0';
// 合言葉。設定すると、入力した人だけが読み書きできる(未設定なら誰でも使える)
const PASSWORD = process.env.TEAM_FOCUS_PASSWORD || '';

const app = express();
app.use(express.json({ limit: '2mb' }));

// --- 合言葉による保護 ---
// 合言葉から作った値をCookieに持たせる。合言葉を変えると、以前のCookieは無効になる。

const SESSION_COOKIE = 'team_focus_session';
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 180;
const sessionToken = PASSWORD ? crypto.createHmac('sha256', PASSWORD).update('team-focus-session').digest('hex') : '';

const sameText = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

const cookieValue = (req, name) => {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
};

const isLoggedIn = (req) => !PASSWORD || sameText(cookieValue(req, SESSION_COOKIE), sessionToken);

// 合言葉の総当たりを防ぐため、同じ接続元からの失敗を一定回数で止める
const LOGIN_MAX_FAILURES = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginFailures = new Map();
const recentFailures = (ip) => {
  const entry = loginFailures.get(ip);
  if (!entry || Date.now() - entry.since > LOGIN_WINDOW_MS) return 0;
  return entry.count;
};

app.get('/api/session', (req, res) => {
  res.json({ passwordRequired: !!PASSWORD, loggedIn: isLoggedIn(req) });
});

app.post('/api/login', (req, res) => {
  if (!PASSWORD) return res.json({ ok: true });
  const ip = req.socket.remoteAddress || '';
  const failures = recentFailures(ip);
  if (failures >= LOGIN_MAX_FAILURES) {
    return res.status(429).json({ error: '合言葉を続けて間違えたため、しばらく入力できません。15分ほど待ってからやり直してください' });
  }
  if (typeof req.body?.password !== 'string' || !sameText(req.body.password, PASSWORD)) {
    loginFailures.set(ip, failures === 0 ? { count: 1, since: Date.now() } : { ...loginFailures.get(ip), count: failures + 1 });
    return res.status(401).json({ error: '合言葉が違います' });
  }
  loginFailures.delete(ip);
  // HTTPSで公開している場合(リバースプロキシ経由を含む)は、HTTPSでしか送らないCookieにする
  const secure = req.secure || req.get('X-Forwarded-Proto') === 'https' ? '; Secure' : '';
  res.set('Set-Cookie', `${SESSION_COOKIE}=${sessionToken}; Path=/; Max-Age=${SESSION_MAX_AGE_SEC}; HttpOnly; SameSite=Lax${secure}`);
  res.json({ ok: true });
});

app.use('/api', (req, res, next) => {
  if (!isLoggedIn(req)) return res.status(401).json({ error: '合言葉を入力してください' });
  next();
});

// --- 入力値の検証 ---
// 各normalizeは正規化した値を返し、不正な値ならnullを返す。未指定(undefined)の項目は検証しない。

const text = (value) => (typeof value === 'string' ? value.trim() : null);
const requiredText = (value) => text(value) || null;
const oneOf = (list) => (value) => (list.includes(value) ? value : null);

// 空欄を許す項目の共通処理。null/undefined/空白のみは空文字にそろえる。
const optional = (normalize) => (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? normalize(trimmed) : '';
};

// 参照リンクはhttp/httpsのみ許可する(javascript:などを保存させない)
const normalizeLink = optional((value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
});

// 日付はYYYY-MM-DDのみ。未設定は空文字で表す。
const normalizeDate = optional((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
});

const projectExists = (id) => !!db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
const memberExists = (id) => typeof id === 'string' && !!db.prepare('SELECT id FROM members WHERE id = ?').get(id);

// 案件の担当メンバー。登録済みのメンバーのIDの配列を、重複を除いてJSON文字列で保存する
const normalizeMemberIds = (value) =>
  Array.isArray(value) && value.every(memberExists) ? JSON.stringify([...new Set(value)]) : null;

// タスクの担当者。空文字は未割当
const normalizeAssignee = (value) => (value === '' || value === null ? '' : memberExists(value) ? value : null);

const DATE_ERROR = (label) => `${label}は YYYY-MM-DD の日付で指定してください`;

const MEMBER_RULES = {
  name: { normalize: requiredText, error: 'メンバー名を入力してください' },
  color: { normalize: oneOf(MEMBER_COLORS), error: '色が不正です' },
};

const PROJECT_RULES = {
  name: { normalize: requiredText, error: '案件名を入力してください' },
  category: { normalize: text, error: 'カテゴリは文字列で指定してください' },
  status: { normalize: oneOf(PROJECT_STATUSES), error: `進捗は ${PROJECT_STATUSES.join(', ')} のいずれかで指定してください` },
  startDate: { normalize: normalizeDate, error: DATE_ERROR('開始日') },
  due: { normalize: normalizeDate, error: DATE_ERROR('期限') },
  next: { normalize: text, error: '次のアクションは文字列で指定してください' },
  startedAt: { normalize: normalizeDate, error: DATE_ERROR('着手日') },
  completedAt: { normalize: normalizeDate, error: DATE_ERROR('完了日') },
  memberIds: { normalize: normalizeMemberIds, error: '担当メンバーが見つかりません' },
};

const TASK_RULES = {
  projectId: { normalize: (v) => (typeof v === 'string' && projectExists(v) ? v : null), error: '案件が見つかりません' },
  title: { normalize: requiredText, error: 'タスク名を入力してください' },
  status: { normalize: oneOf(TASK_STATUSES), error: `進捗は ${TASK_STATUSES.join(', ')} のいずれかで指定してください` },
  priority: { normalize: oneOf(PRIORITIES), error: `優先度は ${PRIORITIES.join(', ')} のいずれかで指定してください` },
  link: { normalize: normalizeLink, error: '参照リンクは http:// または https:// で始まるURLを指定してください' },
  fileLink: { normalize: normalizeLink, error: 'ファイルのリンクは http:// または https:// で始まるURLを指定してください(PC内のファイルの場所ではなく、共有用のリンクを貼り付けてください)' },
  due: { normalize: normalizeDate, error: DATE_ERROR('期限') },
  startDate: { normalize: normalizeDate, error: DATE_ERROR('開始日') },
  repeat: { normalize: (v) => (v === null ? '' : oneOf(REPEAT_RULES)(v)), error: `繰り返しは ${REPEAT_RULES.filter(Boolean).join(', ')} のいずれかで指定してください` },
  startedAt: { normalize: normalizeDate, error: DATE_ERROR('着手日') },
  completedAt: { normalize: normalizeDate, error: DATE_ERROR('完了日') },
  assigneeId: { normalize: normalizeAssignee, error: '担当者が見つかりません' },
};

// 本文のうちルールにある項目だけを検証して取り出す
const pickValid = (body, rules) => {
  const values = {};
  for (const [field, rule] of Object.entries(rules)) {
    if (body?.[field] === undefined) continue;
    const value = rule.normalize(body[field]);
    if (value === null) return { error: rule.error };
    values[field] = value;
  }
  return { values };
};

// サーバーのPCでの今日(YYYY-MM-DD)
const todayString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 進捗の変更に合わせて、実際に進行中にした日(startedAt)と完了にした日(completedAt)を付け外しする。
// - 着手日: 最初に進行中にした日。回答待ちなどを挟んで進行中に戻しても変えない。未着手に戻すと消す。
//   進行中を経ずに完了にした(チェックボックスで直接完了にした)ときは、予定の開始日で埋める。
//   ただし予定の開始日が完了日より後なら、期間がマイナスになるので埋めない。
// - 完了日: 完了にした日。完了のまま再度完了にしても変えない。完了以外に戻すと消す。
// 日付が明示されていればそちらを優先する(付け忘れの後からの修正用)。
// currentは変更前の { status, startDate, startedAt, completedAt }。新規登録では空で渡す。
const NEW_ROW = { status: '', startDate: '', startedAt: '', completedAt: '' };
const withStatusDates = (values, current) => {
  if (values.status === undefined) return values;
  const result = { ...values };
  if (values.completedAt === undefined) {
    if (values.status !== '完了') result.completedAt = '';
    else if (current.status !== '完了') result.completedAt = todayString();
  }
  if (values.startedAt === undefined && !current.startedAt) {
    const plannedStart = values.startDate ?? current.startDate;
    const completedAt = result.completedAt ?? current.completedAt;
    if (values.status === '進行中') result.startedAt = todayString();
    else if (values.status === '完了' && plannedStart && plannedStart <= completedAt) result.startedAt = plannedStart;
  }
  if (values.startedAt === undefined && values.status === '未着手') result.startedAt = '';
  return result;
};

// 列名はルールのキー(固定の一覧)に限られるので、SQLに埋め込んでも安全
const updateRow = (table, id, values) => {
  const fields = Object.keys(values);
  db.prepare(`UPDATE ${table} SET ${fields.map(f => `${f} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(f => values[f]), id);
};

// --- メンバー ---

app.get('/api/members', (_req, res) => {
  res.json(db.prepare('SELECT * FROM members ORDER BY sortOrder, name').all());
});

app.post('/api/members', (req, res) => {
  const { values, error } = pickValid(req.body, MEMBER_RULES);
  if (error) return res.status(400).json({ error });
  if (!values.name) return res.status(400).json({ error: MEMBER_RULES.name.error });
  res.status(201).json(insertMember(values));
});

app.patch('/api/members/:id', (req, res) => {
  const { id } = req.params;
  if (!memberExists(id)) return res.status(404).json({ error: 'member not found' });

  const { values, error } = pickValid(req.body, MEMBER_RULES);
  if (error) return res.status(400).json({ error });
  if (Object.keys(values).length === 0) {
    return res.status(400).json({ error: `at least one of ${Object.keys(MEMBER_RULES).join(', ')} is required` });
  }

  updateRow('members', id, values);
  res.json(db.prepare('SELECT * FROM members WHERE id = ?').get(id));
});

// メンバーの削除。担当していたタスクは未割当に戻し、案件の担当からも外す。
app.delete('/api/members/:id', (req, res) => {
  const { id } = req.params;
  if (!memberExists(id)) return res.status(404).json({ error: 'member not found' });

  db.exec('BEGIN');
  try {
    db.prepare("UPDATE tasks SET assigneeId = '' WHERE assigneeId = ?").run(id);
    for (const p of db.prepare('SELECT id, memberIds FROM projects').all().map(rowToProject)) {
      if (p.memberIds.includes(id)) {
        db.prepare('UPDATE projects SET memberIds = ? WHERE id = ?').run(JSON.stringify(p.memberIds.filter(m => m !== id)), p.id);
      }
    }
    db.prepare('DELETE FROM members WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  res.json({ id });
});

// --- 案件 ---

app.get('/api/projects', (_req, res) => {
  res.json(db.prepare('SELECT * FROM projects').all().map(rowToProject));
});

app.post('/api/projects', (req, res) => {
  const { values, error } = pickValid(req.body, PROJECT_RULES);
  if (error) return res.status(400).json({ error });
  if (!values.name) return res.status(400).json({ error: PROJECT_RULES.name.error });

  res.status(201).json(insertProject(withStatusDates(values, NEW_ROW)));
});

app.patch('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  if (id === NO_PROJECT_ID) {
    return res.status(400).json({ error: '「案件外」は編集できません' });
  }
  if (!projectExists(id)) {
    return res.status(404).json({ error: 'project not found' });
  }

  const { values, error } = pickValid(req.body, PROJECT_RULES);
  if (error) return res.status(400).json({ error });
  if (Object.keys(values).length === 0) {
    return res.status(400).json({ error: `at least one of ${Object.keys(PROJECT_RULES).join(', ')} is required` });
  }

  const current = db.prepare('SELECT status, startDate, startedAt, completedAt FROM projects WHERE id = ?').get(id);
  updateRow('projects', id, withStatusDates(values, current));
  res.json(rowToProject(db.prepare('SELECT * FROM projects WHERE id = ?').get(id)));
});

// 案件の削除。配下のタスクは、まとめて削除するか「案件外」へ移すかを選べる。
app.delete('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  if (id === NO_PROJECT_ID) {
    return res.status(400).json({ error: '「案件外」は削除できません' });
  }
  if (!projectExists(id)) {
    return res.status(404).json({ error: 'project not found' });
  }

  const mode = req.query.tasks === 'delete' ? 'delete' : 'detach';
  const taskCount = db.prepare('SELECT COUNT(*) AS c FROM tasks WHERE projectId = ?').get(id).c;

  if (mode === 'delete') db.prepare('DELETE FROM tasks WHERE projectId = ?').run(id);
  else db.prepare('UPDATE tasks SET projectId = ? WHERE projectId = ?').run(NO_PROJECT_ID, id);

  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  res.json({ id, tasks: mode, taskCount });
});

// --- タスク ---

app.get('/api/tasks', (_req, res) => {
  res.json(db.prepare('SELECT * FROM tasks').all().map(rowToTask));
});

app.post('/api/tasks', (req, res) => {
  const { values, error } = pickValid(req.body, TASK_RULES);
  if (error) return res.status(400).json({ error });
  if (!values.projectId || !values.title) {
    return res.status(400).json({ error: 'projectId and title are required' });
  }

  // 定周期タスクの次回分。完了の付け外しや複数の画面からの操作でも、元タスク1件につき1回だけ作る
  if (req.body.spawnedFrom !== undefined) {
    const claimed = db.prepare('UPDATE tasks SET spawnedNext = 1 WHERE id = ? AND spawnedNext = 0').run(req.body.spawnedFrom);
    if (claimed.changes === 0) {
      return res.status(409).json({ error: '次回分は作成済みです' });
    }
  }

  res.status(201).json(insertTask(withStatusDates(values, NEW_ROW)));
});

// Excelからの一括登録。1行でも不正なら何も登録せず、何行目が悪いかを返す。
const IMPORT_MAX_ROWS = 1000;
app.post('/api/tasks/import', (req, res) => {
  const { projectId, tasks } = req.body ?? {};
  if (typeof projectId !== 'string' || !projectExists(projectId)) {
    return res.status(400).json({ error: TASK_RULES.projectId.error });
  }
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return res.status(400).json({ error: '登録するタスクがありません' });
  }
  if (tasks.length > IMPORT_MAX_ROWS) {
    return res.status(400).json({ error: `一度に登録できるのは${IMPORT_MAX_ROWS}件までです` });
  }

  const rows = [];
  for (const [i, body] of tasks.entries()) {
    // 案件は画面で選んだものにそろえる(行ごとの指定は受け付けない)
    const { values, error } = pickValid({ ...body, projectId }, TASK_RULES);
    const label = body?.row ? `${body.row}行目` : `${i + 1}件目`;
    if (error) return res.status(400).json({ error: `${label}: ${error}` });
    if (!values.title) return res.status(400).json({ error: `${label}: ${TASK_RULES.title.error}` });
    rows.push(withStatusDates(values, NEW_ROW));
  }

  db.exec('BEGIN');
  try {
    const created = rows.map(insertTask);
    db.exec('COMMIT');
    res.status(201).json(created);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
});

app.patch('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const current = db.prepare('SELECT status, startDate, startedAt, completedAt FROM tasks WHERE id = ?').get(id);
  if (!current) {
    return res.status(404).json({ error: 'task not found' });
  }

  const { values, error } = pickValid(req.body, TASK_RULES);
  if (error) return res.status(400).json({ error });
  if (Object.keys(values).length === 0) {
    return res.status(400).json({ error: `at least one of ${Object.keys(TASK_RULES).join(', ')} is required` });
  }

  updateRow('tasks', id, withStatusDates(values, current));
  res.json(rowToTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)));
});

app.delete('/api/tasks/:id', (req, res) => {
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'task not found' });
  }
  res.json({ ok: true });
});
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'not found' });
});

// --- 画面 ---
// `npm run build` で作った画面(dist)があれば、APIと同じポートで配信する。
// 開発中は Vite(`npm run dev`)が画面を出し、/api だけをこのサーバーへ中継する。
const DIST_DIR = path.resolve(import.meta.dirname, '../dist');
if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  app.use(express.static(DIST_DIR));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, HOST, () => {
  console.log(`Team Focus: http://localhost:${PORT}`);
  if (!PASSWORD) console.log('合言葉(TEAM_FOCUS_PASSWORD)が未設定です。このアドレスにつながる人は誰でも読み書きできます。');
});
