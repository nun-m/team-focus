// サーバーと画面で共通の定数。片方だけ変えるとずれるため、ここでまとめて管理する。

// 案件に属さないタスク(問い合わせ対応など)の受け皿。
// projectIdは外部キーのため空にできないので専用レコードを置き、UI側では案件一覧・ガント・集計から除外する。
export const NO_PROJECT_ID = '__none__';

export const TASK_STATUSES = ['未着手', '進行中', '回答待ち', '完了'];
export const PROJECT_STATUSES = ['未着手', '進行中', '完了'];
export const PRIORITIES = ['高', '中', '低'];

// 定周期タスクの繰り返し(空=繰り返さない)。完了時に次回分を作るのはUI側。
export const REPEAT_RULES = ['', 'daily', 'weekday', 'weekly', 'monthly'];

// 案件の色は進捗で決まる(選ばせない)。タスクのバーと同じ配色にそろえる。
export const PROJECT_STATUS_COLORS = { '未着手': 'bg-slate-400', '進行中': 'bg-blue-500', '完了': 'bg-emerald-500' };

// メンバーのアイコンの色
export const MEMBER_COLORS = ['bg-sky-500', 'bg-pink-500', 'bg-teal-500', 'bg-orange-500', 'bg-indigo-500', 'bg-lime-600', 'bg-fuchsia-500', 'bg-cyan-600', 'bg-red-500', 'bg-yellow-500'];
