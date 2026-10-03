import { NO_PROJECT_ID } from "@/lib/constants";
import type { Project } from "@/types";

// 案件のプルダウンの選択肢。末尾に「案件外」を付ける。
export function ProjectOptions({ projects, noProjectLabel = "案件外" }: { projects: Project[]; noProjectLabel?: string }) {
  return (
    <>
      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      <option value={NO_PROJECT_ID}>{noProjectLabel}</option>
    </>
  );
}
