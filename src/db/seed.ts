// 예시 데이터를 넣는다 (개발용). 실제 데이터는 단계 1-0 가져오기로.
import { readFileSync } from "node:fs";
import type Database from "better-sqlite3";
import { Store } from "./store.js";

type Seed = {
  projects: {
    name: string;
    milestones?: { name: string; due_at?: string }[];
    tasks?: {
      title: string;
      milestone?: string;
      source?: string;
      source_ref?: string;
      external_text?: boolean;
    }[];
  }[];
};

export function seed(db: Database.Database, path: string): void {
  const data = JSON.parse(readFileSync(path, "utf8")) as Seed;
  const store = new Store(db);
  for (const p of data.projects) {
    const projectId = store.createProject("seed", p.name);
    const ms = new Map<string, string>();
    for (const m of p.milestones ?? []) {
      ms.set(m.name, store.createMilestone("seed", projectId, m.name, m.due_at));
    }
    for (const t of p.tasks ?? []) {
      store.createTask("seed", {
        projectId,
        title: t.title,
        milestoneId: t.milestone ? ms.get(t.milestone) : undefined,
        source: t.source,
        sourceRef: t.source_ref,
        externalText: t.external_text,
      });
    }
  }
}
