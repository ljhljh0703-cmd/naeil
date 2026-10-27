import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  type ApiTask,
  api,
  type Change,
  getKey,
  type Milestone,
  type Project,
  setKey,
} from "./api.js";
import { type ActFn, CardList, DetailPanel, type OpenFn } from "./ItemViews.js";
import {
  type Action,
  type CardModel,
  type Ctx,
  cardOf,
  detailOf,
  type ItemRef,
  parseRef,
  refKey,
} from "./items.js";
import { dLabel, todayFmt } from "./labels.js";
import { Board } from "./MilestoneBoard.js";
import { dDay, dueFromKstDate, dueSoon, kstDate, pickNow, waitingOnMe } from "./today.js";

type Mode = "board" | "focus";
type Page = "today" | "milestones";

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장이 막혀도 이번 창에서는 동작
  }
}

// 오늘 하루 건너뛴 것·고정한 것 (이 브라우저에만)
function useDayState() {
  const storeKey = `naeil.day.${kstDate(new Date())}`;
  const [state, setState] = useState(() =>
    load<{ skipped: string[]; pinned: string | null }>(storeKey, { skipped: [], pinned: null }),
  );
  return {
    ...state,
    save: (next: typeof state) => {
      setState(next);
      save(storeKey, next);
    },
  };
}

// 열린 항목은 주소에 담는다: ?open=task:… (패널) · &full=1 (페이지 하나로)
function readUrl(): { ref: ItemRef | null; full: boolean } {
  const q = new URLSearchParams(window.location.search);
  return { ref: parseRef(q.get("open")), full: q.get("full") === "1" };
}
function urlFor(ref: ItemRef | null, full = false) {
  if (!ref) return window.location.pathname;
  return `?open=${encodeURIComponent(refKey(ref))}${full ? "&full=1" : ""}`;
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
      <header className="top">
        <div>
          <h1>내일은내일</h1>
          <p className="tagline">내 일은 naeil에서</p>
        </div>
      </header>
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

export function App() {
  const [hasKey, setHasKey] = useState(() => !!getKey());
  const [keyError, setKeyError] = useState<string>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [page, setPageState] = useState<Page>(() => load<Page>("naeil.page", "today"));
  const [boardProject, setBoardProjectState] = useState<string | null>(() =>
    load<string | null>("naeil.project", null),
  );
  const [error, setError] = useState<string>();
  const [showAll, setShowAll] = useState(false);
  const [mode, setModeState] = useState<Mode>(() => load<Mode>("naeil.mode", "board"));
  const [open, setOpen] = useState(readUrl);
  const [openList, setOpenList] = useState<ItemRef[]>([]);
  const opener = useRef<HTMLElement | null>(null);
  const day = useDayState();

  const setMode = (m: Mode) => {
    setModeState(m);
    save("naeil.mode", m);
  };
  const setPage = (p: Page) => {
    setPageState(p);
    save("naeil.page", p);
  };
  const setBoardProject = (id: string) => {
    setBoardProjectState(id);
    save("naeil.project", id);
  };

  const reload = useCallback(async () => {
    try {
      const [p, t, c] = await Promise.all([api.projects(), api.allTasks(), api.changes()]);
      const m = await api.allMilestones(p);
      setProjects(p);
      setMilestones(m);
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
    if (hasKey) void reload();
  }, [hasKey, reload]);

  // 뒤로 가기 = 패널 닫기 (폰에서 자연스럽게)
  useEffect(() => {
    const onPop = () => setOpen(readUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openItem: OpenFn = (ref, list, el) => {
    const wasOpen = !!open.ref;
    opener.current = el;
    setOpenList(list);
    setOpen({ ref, full: false });
    if (wasOpen) window.history.replaceState({ naeil: true }, "", urlFor(ref));
    else window.history.pushState({ naeil: true }, "", urlFor(ref));
  };

  const closeItem = useCallback(() => {
    if (window.history.state?.naeil) window.history.back();
    else window.history.replaceState(null, "", urlFor(null));
    setOpen({ ref: null, full: false });
    // 닫으면 연 카드로 포커스를 돌려준다
    const el = opener.current;
    requestAnimationFrame(() => el?.focus());
  }, []);

  const move = useCallback(
    (step: 1 | -1) => {
      if (!open.ref || openList.length < 2) return;
      const i = openList.findIndex((r) => refKey(r) === refKey(open.ref as ItemRef));
      const next = openList[(i + step + openList.length) % openList.length];
      if (!next) return;
      setOpen({ ref: next, full: open.full });
      window.history.replaceState(window.history.state, "", urlFor(next, open.full));
      opener.current = document.querySelector<HTMLElement>(
        `[data-ref="${refKey(next)}"] :is(.card-link, .ms-link)`,
      );
    },
    [open, openList],
  );

  // Esc 닫기, J/K 앞뒤 (글을 쓰는 중에는 안 받음)
  useEffect(() => {
    if (!open.ref) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select")) return;
      if (e.key === "Escape") closeItem();
      else if (e.key === "j" || e.key === "ArrowDown") {
        if (e.key === "j" || t.closest(".detail")) {
          e.preventDefault();
          move(1);
        }
      } else if (e.key === "k" || e.key === "ArrowUp") {
        if (e.key === "k" || t.closest(".detail")) {
          e.preventDefault();
          move(-1);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open.ref, closeItem, move]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 412) {
        setError("다른 곳에서 먼저 바뀌었습니다. 새로 불러왔으니 한 번 더 해 주세요.");
        await reload();
        return;
      }
      setError((err as Error).message);
    }
  };

  const onAction: ActFn = (ref, a, value) => {
    if (ref.type === "milestone") {
      const m = milestones.find((x) => x.id === ref.id);
      if (!m) return;
      if (a.id === "milestone-due") {
        void run(() => api.updateMilestone(m, { dueAt: value ? dueFromKstDate(value) : null }));
      } else if (a.id === "milestone-trash") {
        void run(async () => {
          await api.trashMilestone(m.id);
          if (open.ref && refKey(open.ref) === refKey(ref)) closeItem();
        });
      }
      return;
    }
    if (ref.type !== "task") return;
    const id = ref.id;
    const byId: Record<string, () => Promise<unknown>> = {
      "move-milestone": () => api.setMilestone(id, value ? value : null),
      start: () => api.setStatus(id, "doing"),
      done: () => api.setStatus(id, "done"),
      reopen: () => api.revive(id),
      decided: () => api.unblock(id),
      "need-decision": () => api.block(id, "my_decision"),
      trash: async () => {
        await api.trash(id);
        if (open.ref && refKey(open.ref) === refKey(ref)) closeItem();
      },
    };
    const fn = byId[a.id];
    if (fn) void run(fn);
  };

  const now = new Date();
  const ctx: Ctx = { tasks, changes, projects, milestones, now };
  const skipped = useMemo(() => new Set(day.skipped), [day.skipped]);
  const current = pickNow(tasks, { skipped, pinnedId: day.pinned });
  const cards = (list: ApiTask[], quick?: (t: ApiTask) => Action | undefined): CardModel[] =>
    list
      .map((t): CardModel | null => {
        const c = cardOf(ctx, { type: "task", id: t.id });
        return c ? { ...c, quickAction: quick?.(t) } : null;
      })
      .filter((c): c is CardModel => !!c);

  const decideCards = cards(waitingOnMe(tasks) as ApiTask[], () => ({
    id: "decided",
    label: "정했음",
  }));
  const soonCards = cards(dueSoon(tasks, now) as ApiTask[]).map((c) => ({
    ...c,
    status: undefined,
  }));
  const recentCards = changes
    .slice(0, 6)
    .map((c) => cardOf(ctx, { type: "change", id: String(c.id) }))
    .filter((c): c is CardModel => !!c);
  const allCards = cards(tasks, (t) =>
    t.status !== "done" ? { id: "done", label: "끝냄" } : undefined,
  );
  const today = kstDate(now);
  const doneToday = changes.filter(
    (c) =>
      c.entity === "task" &&
      c.action === "status" &&
      c.details?.to === "done" &&
      kstDate(new Date(c.at)) === today,
  );
  const doneTodayCards = [...new Set(doneToday.map((c) => c.entityId))]
    .map((id) => cardOf(ctx, { type: "task", id }))
    .filter((c): c is CardModel => !!c);

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

  const detail = open.ref ? detailOf(ctx, open.ref) : null;
  const posIndex = open.ref
    ? openList.findIndex((r) => refKey(r) === refKey(open.ref as ItemRef))
    : -1;
  const panel = open.ref && (
    <DetailPanel
      detail={detail}
      position={posIndex >= 0 ? { index: posIndex, total: openList.length } : null}
      onClose={closeItem}
      onMove={move}
      onOpen={openItem}
      onAction={onAction}
      onExpand={(ref) => {
        setOpen({ ref, full: true });
        window.history.replaceState(window.history.state, "", urlFor(ref, true));
      }}
      full={open.full}
    />
  );

  const header = (
    <header className="top">
      <div>
        <h1>내일은내일</h1>
        <p className="tagline">내 일은 naeil에서</p>
      </div>
      <div className="top-right">
        <nav aria-label="화면">
          <fieldset className="seg">
            <button type="button" aria-pressed={page === "today"} onClick={() => setPage("today")}>
              오늘
            </button>
            <button
              type="button"
              aria-pressed={page === "milestones"}
              onClick={() => setPage("milestones")}
            >
              마일스톤
            </button>
          </fieldset>
        </nav>
        <p className="date">{todayFmt.format(now)}</p>
      </div>
    </header>
  );

  const modeBar = (
    <div className="toolbar">
      <fieldset className="seg small" aria-label="오늘 보기 방식">
        <button type="button" aria-pressed={mode === "board"} onClick={() => setMode("board")}>
          전체 보기
        </button>
        <button type="button" aria-pressed={mode === "focus"} onClick={() => setMode("focus")}>
          집중 보기
        </button>
      </fieldset>
    </div>
  );

  // 크게 보기: 상세를 페이지 하나로
  if (open.ref && open.full) {
    return (
      <main className="shell narrow">
        {header}
        {panel}
      </main>
    );
  }

  const nowCard = current && (
    <section className={`card hero ${mode === "focus" ? "focus" : ""}`} aria-labelledby="now-title">
      <p className="label" id="now-title">
        지금 할 것
      </p>
      <h2 className="now">
        <a
          className="now-link"
          href={urlFor({ type: "task", id: current.id })}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey) return;
            e.preventDefault();
            openItem(
              { type: "task", id: current.id },
              [{ type: "task", id: current.id }],
              e.currentTarget,
            );
          }}
        >
          {current.title}
        </a>
      </h2>
      <p className="meta">
        {projects.find((p) => p.id === current.projectId)?.name}
        {current.status === "doing" && <span className="chip tone-info">하는 중</span>}
        {current.dueAt && <span className="chip">{dLabel(dDay(current.dueAt, now))}</span>}
        {day.pinned === current.id && <span className="chip">오늘은 이거</span>}
      </p>
      <div className="row">
        {current.status === "todo" ? (
          <button
            type="button"
            className="primary"
            onClick={() => void run(() => api.setStatus(current.id, "doing"))}
          >
            시작
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={() => void run(() => api.setStatus(current.id, "done"))}
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
          onClick={() => void run(() => api.block(current.id, "my_decision"))}
        >
          내가 정할 게 있음
        </button>
      </div>
    </section>
  );

  const emptyNow = (
    <section className={`card hero ${mode === "focus" ? "focus" : ""}`}>
      <p className="label">지금 할 것</p>
      <h2 className="now muted">
        {mode === "focus" ? "오늘 할 일을 다 끝냈습니다" : "지금 할 것이 없습니다"}
      </h2>
      <div className="row">
        {day.skipped.length > 0 && (
          <button type="button" onClick={() => day.save({ skipped: [], pinned: day.pinned })}>
            건너뛴 {day.skipped.length}개 다시 보기
          </button>
        )}
      </div>
    </section>
  );

  return (
    <div className={open.ref ? "layout with-panel" : "layout"}>
      <main className="shell">
        {header}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {page === "milestones" ? (
          <Board
            ctx={ctx}
            projectId={boardProject}
            onProject={setBoardProject}
            onOpen={openItem}
            onAction={onAction}
            openRef={open.ref}
            onReload={reload}
            onError={setError}
          />
        ) : (
          <>
            {modeBar}
            {current ? nowCard : emptyNow}

            {mode === "focus" ? (
              <section className="card focus-foot" aria-labelledby="done-title">
                <p className="label" id="done-title">
                  오늘 끝낸 일 <span className="count">{doneTodayCards.length}</span>
                  {decideCards.length > 0 && (
                    <button type="button" className="ghost small" onClick={() => setMode("board")}>
                      내가 정할 것 {decideCards.length}개 보기
                    </button>
                  )}
                </p>
                <CardList
                  cards={doneTodayCards}
                  onOpen={openItem}
                  openRef={open.ref}
                  empty="아직 끝낸 일이 없습니다"
                />
              </section>
            ) : (
              <>
                <div className="grid">
                  <section className="card" aria-labelledby="last-title">
                    <p className="label" id="last-title">
                      마지막에 한 일
                    </p>
                    <CardList
                      cards={recentCards}
                      onOpen={openItem}
                      openRef={open.ref}
                      empty="아직 기록이 없습니다"
                    />
                  </section>
                  <section className="card" aria-labelledby="decide-title">
                    <p className="label" id="decide-title">
                      내가 정할 것 <span className="count">{decideCards.length}</span>
                    </p>
                    <CardList
                      cards={decideCards}
                      onOpen={openItem}
                      onAction={onAction}
                      openRef={open.ref}
                      empty="기다리는 결정이 없습니다"
                    />
                  </section>
                  <section className="card" aria-labelledby="due-title">
                    <p className="label" id="due-title">
                      마감 가까운 것 <span className="count">{soonCards.length}</span>
                    </p>
                    <CardList
                      cards={soonCards}
                      onOpen={openItem}
                      openRef={open.ref}
                      empty="7일 안에 마감이 없습니다"
                    />
                  </section>
                </div>

                <AddTask projects={projects} onDone={reload} onError={setError} />

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
                    <div className="all-list">
                      <CardList
                        cards={allCards}
                        onOpen={openItem}
                        onAction={onAction}
                        openRef={open.ref}
                        empty="할 일이 없습니다"
                      />
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}

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
      {panel}
    </div>
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
