// 画面とAPIは同じアドレスで動く(開発中はViteが /api をAPIサーバーへ中継する)
const API_BASE = "/api";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// APIを呼んでJSONを返す。失敗時はサーバーのエラーメッセージでApiErrorにする(statusで分岐できる)。
export async function requestJson<T = unknown>(path: string, { method = "GET", body = undefined as unknown } = {}): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  // 合言葉が変わったなどで入り直しが必要になったら、読み込み直して合言葉の画面に戻す
  if (r.status === 401 && path !== "/login") window.location.reload();
  if (!r.ok) throw new ApiError(data?.error || `通信に失敗しました(${r.status})`, r.status);
  return data as T;
}
