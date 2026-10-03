import { useEffect, useState, type ReactNode } from "react";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/api";
import { inputClass } from "@/lib/constants";

interface Session {
  passwordRequired: boolean;
  loggedIn: boolean;
}

// サーバーに合言葉が設定されているときだけ、入力するまで中身を出さない
export function LoginGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "locked" | "open">("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    requestJson<Session>("/session")
      .then(s => setState(s.loggedIn ? "open" : "locked"))
      // つながらないときは中身を出し、そちらのエラー表示に任せる
      .catch(() => setState("open"));
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    requestJson("/login", { method: "POST", body: { password } })
      .then(() => setState("open"))
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSending(false));
  };

  if (state === "open") return <>{children}</>;
  if (state === "checking") return <div className="min-h-screen bg-[#f5f7fb]" />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-6 text-slate-900">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white"><Target className="h-5 w-5" /></div>
          <h1 className="text-lg font-bold tracking-tight">Team Focus</h1>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-600">合言葉</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus autoComplete="current-password" className={inputClass} />
        </label>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <Button type="submit" disabled={!password || sending} className="w-full rounded-xl bg-slate-900">開く</Button>
      </form>
    </div>
  );
}
