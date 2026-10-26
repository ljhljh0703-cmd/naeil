import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, api, type Change, getKey, type Project, setKey } from "./api.js";
import {
  type BlockedReason,
  dDay,
  dueFromKstDate,
  dueSoon,
  kstDate,
  pickNow,
  type Status,
  type Task,
  waitingOnMe,
} from "./today.js";

const STATUS: Record<Status, string> = { todo: "할 일", doing: "하는 중", done: "끝" };
const BLOCKED: Record<BlockedReason, string> = {
  my_decision: "내 결정 기다림",
  ai_working: "AI가 하는 중",
  external: "바깥 답 기다림",
  tech: "기술 문제",
};
const ACTION: Record<string, string> = {
  create: "만듦",
  status: "상태 바꿈",
  update: "고침",
  block: "멈춤",
  unblock: "멈춤 풀림",
  trash: "휴지통",
  revive: "되살림",
};

const timeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const todayFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  weekday: "long",
});

const dLabel = (n: number) => (n === 0 ? "오늘 마감" : n > 0 ? `D-${n}` : `${-n}일 지남`);

// 오늘 하루 건너뛴 것·고정한 것 (이 브라우저에만)
function useDayState() {
  const day = kstDate(new Date());
  const storeKey = `naeil.day.${day}`;
  const [state, setState] = useState<{ skipped: string[]; pinned: string | null }>(() => {
    try {
      return JSON.parse(localStorage.getItem(storeKey) ?? "") as {
        skipped: string[];
        pinned: string | null;
      };
    } catch {
      return { skipped: [], pinned: null };
    }
  });
  const save = (next: typeof state) => {
    setState(next);
    try {
      localStorage.setItem(storeKey, JSON.stringify(next));
    } catch {
      // 저장이 막혀도 이번 창에서는 동작
    }
  };
  return { ...state, save };
}

function KeyForm({ onSaved, error }: { onSaved: () => void; error?: string }) {
  const [value, setValue] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setKey(value.trim());
    onSaved();
  };
  return (
    <main className="shell narrow">
      <Header />
      <section className="card">
        <h2>출입증 넣기</h2>
        <p className="muted">
          맥 터미널에서 <code>npm run key -- new author</code> 로 만든 화면용 출입증을 붙여
          넣으세요. 이 브라우저에만 저장됩니다.
        </p>
        {error && <p className="error">{error}</p>}
        <form onSubmit={submit} className="row">
          <input
            type="password"
            autoComplete="off"
            placeholder="nk_로 시작하는 출입증"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit" className="primary" disabled={!value.trim()}>
            저장
          </button>
        </form>
      </section>
    </main>
  );
}

function Header() {
  return (
    <header className="top">
      <div>
        <h1>내일은내일</h1>
        <p className="tagline">내 일은 naeil에서</p>
      </div>
      <p className="date">{todayFmt.format(new Date())}</p>
    </header>
  );
}

export function App() {
  const [hasKey, setHasKey] = useState(() => !!getKey());
  const [keyError, setKeyError] = useState<string>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [error, setError] = useState<string>();
  const [showAll, setShowAll] = useState(false);
  const day = useDayState();

  const load = useCallback(async () => {
    try {
      const [p, t, c] = await Promise.all([api.projects(), api.allTasks(), api.changes()]);
      setProjects(p);
      setTasks(t);
      setChanges(c);
      setError(undefined);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setKey(null);
        setKeyError("출입증이 맞지 않습니다. 다시 넣어 주세요.");
        setHasKey(false);
      } else {
        setError((err as Error).message);
      }
    }
  }, []);

  useEffect(() => {
    if (hasKey) void load();
  }, [hasKey, load]);

  const act = (fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const now = new Date();
  const skipped = useMemo(() => new Set(day.skipped), [day.skipped]);
  const current = pickNow(tasks, { skipped, pinnedId: day.pinned });
  const decide = waitingOnMe(tasks);
  const soon = dueSoon(tasks, now);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "";
  const titleOf = (c: Change) =>
    c.entity === "task"
      ? (tasks.find((t) => t.id === c.entityId)?.title ??
        (c.details?.title as string) ??
        "(휴지통)")
      : ((c.details?.name as string) ?? projectName(c.entityId));

  if (!hasKey) {
    return (
      <KeyForm
        error={keyError}
        onSaved={() => {
          setKeyError(undefined);
          setHasKey(true);
        }}
      />
    );
  }

  return (
    <main className="shell">
      <Header />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="card hero" aria-labelledby="now-title">
        <p className="label" id="now-title">
          지금 할 것
        </p>
        {current ? (
          <>
            <h2 className="now">{current.title}</h2>
            <p className="meta">
              {projectName(current.projectId)}
              {current.status === "doing" && <span className="chip doing">하는 중</span>}
              {current.dueAt && <span className="chip">{dLabel(dDay(current.dueAt, now))}</span>}
              {day.pinned === current.id && <span className="chip">오늘은 이거</span>}
            </p>
            <div className="row">
              {current.status === "todo" ? (
                <button
                  type="button"
                  className="primary"
                  onClick={act(() => api.setStatus(current.id, "doing"))}
                >
                  시작
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  onClick={act(() => api.setStatus(current.id, "done"))}
                >
                  끝냄
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  day.save({
                    skipped: [...day.skipped, current.id],
                    pinned: day.pinned === current.id ? null : day.pinned,
                  })
                }
              >
                건너뛰기
              </button>
              {day.pinned !== current.id && (
                <button type="button" onClick={() => day.save({ ...day, pinned: current.id })}>
                  오늘은 이거
                </button>
              )}
              <button
                type="button"
                className="ghost"
                onClick={act(() => api.block(current.id, "my_decision"))}
              >
                내가 정할 게 있음
              </button>
            </div>
          </>
        ) : (
          <div>
            <h2 className="now muted">지금 할 것이 없습니다</h2>
            {day.skipped.length > 0 && (
              <button type="button" onClick={() => day.save({ skipped: [], pinned: day.pinned })}>
                건너뛴 {day.skipped.length}개 다시 보기
              </button>
            )}
          </div>
        )}
      </section>

      <div className="grid">
        <section className="card" aria-labelledby="last-title">
          <p className="label" id="last-title">
            마지막에 한 일
          </p>
          {changes.length === 0 ? (
            <p className="muted">아직 기록이 없습니다</p>
          ) : (
            <ul className="list">
              {changes.map((c) => (
                <li key={c.id}>
                  <span className="when">{timeFmt.format(new Date(c.at))}</span>
                  <span className="who">
                    {c.actor}
                    {c.session ? ` · ${c.session}` : ""}
                  </span>
                  <span className="what">
                    「{titleOf(c)}」 {ACTION[c.action] ?? c.action}
                    {c.action === "status" && c.details
                      ? ` (${STATUS[c.details.to as Status] ?? c.details.to})`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="decide-title">
          <p className="label" id="decide-title">
            내가 정할 것 <span className="count">{decide.length}</span>
          </p>
          {decide.length === 0 ? (
            <p className="muted">기다리는 결정이 없습니다</p>
          ) : (
            <ul className="list">
              {decide.map((t) => (
                <li key={t.id} className="item">
                  <span className="what">{t.title}</span>
                  <button type="button" className="small" onClick={act(() => api.unblock(t.id))}>
                    정했음
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="due-title">
          <p className="label" id="due-title">
            마감 가까운 것 <span className="count">{soon.length}</span>
          </p>
          {soon.length === 0 ? (
            <p className="muted">7일 안에 마감이 없습니다</p>
          ) : (
            <ul className="list">
              {soon.map((t) => {
                const d = dDay(t.dueAt as string, now);
                return (
                  <li key={t.id} className="item">
                    <span className={`chip ${d < 0 ? "late" : d <= 1 ? "warn" : ""}`}>
                      {dLabel(d)}
                    </span>
                    <span className="what">{t.title}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <AddTask projects={projects} onDone={load} onError={setError} />

      <section className="card">
        <button
          type="button"
          className="ghost wide"
          onClick={() => setShowAll(!showAll)}
          aria-expanded={showAll}
        >
          할 일 전체 {tasks.filter((t) => t.status !== "done").length}개{" "}
          {showAll ? "접기" : "펼치기"}
        </button>
        {showAll && (
          <ul className="list all">
            {tasks.map((t) => (
              <li key={t.id} className="item">
                <select
                  aria-label={`「${t.title}」 상태`}
                  value={t.status}
                  onChange={(e) => void act(() => api.setStatus(t.id, e.target.value as Status))()}
                >
                  {(Object.keys(STATUS) as Status[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS[s]}
                    </option>
                  ))}
                </select>
                <span className={`what ${t.status === "done" ? "done" : ""}`}>{t.title}</span>
                <span className="muted small-text">
                  {projectName(t.projectId)}
                  {t.blockedReason
                    ? ` · ${BLOCKED[t.blockedReason]}${t.heldBy ? `(${t.heldBy})` : ""}`
                    : ""}
                </span>
                <button type="button" className="small ghost" onClick={act(() => api.trash(t.id))}>
                  휴지통
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="foot">
        <button
          type="button"
          className="ghost small"
          onClick={() => {
            setKey(null);
            setHasKey(false);
          }}
        >
          출입증 바꾸기
        </button>
      </footer>
    </main>
  );
}

function AddTask({
  projects,
  onDone,
  onError,
}: {
  projects: Project[];
  onDone: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [newProject, setNewProject] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const chosen = projectId || projects[0]?.id || "";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      let pid = chosen;
      if (!pid || pid === "__new") pid = (await api.createProject(newProject.trim() || "기본")).id;
      await api.createTask({
        projectId: pid,
        title: title.trim(),
        dueAt: due ? dueFromKstDate(due) : undefined,
      });
      setTitle("");
      setDue("");
      setNewProject("");
      setProjectId(pid);
      await onDone();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <p className="label">할 일 넣기</p>
      <form className="add" onSubmit={submit}>
        <input
          aria-label="할 일"
          placeholder="무엇을 할까요"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select aria-label="프로젝트" value={chosen} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="__new">+ 새 프로젝트</option>
        </select>
        {(chosen === "__new" || projects.length === 0) && (
          <input
            aria-label="새 프로젝트 이름"
            placeholder="새 프로젝트 이름"
            value={newProject}
            maxLength={100}
            onChange={(e) => setNewProject(e.target.value)}
          />
        )}
        <input
          aria-label="마감 날짜"
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
        <button type="submit" className="primary" disabled={busy || !title.trim()}>
          넣기
        </button>
      </form>
    </section>
  );
}
