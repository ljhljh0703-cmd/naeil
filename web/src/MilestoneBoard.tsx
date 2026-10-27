// 프로젝트별 마일스톤 보드 (Linear 프로젝트 마일스톤 배치).
// 프로젝트 고르기 → 전체 진행 → 마일스톤마다 진행 막대와 속한 할 일 → 맨 끝 「마일스톤 없음」.
import { type FormEvent, type MouseEvent, useState } from "react";
import { api, type Project } from "./api.js";
import {
  groupBoard,
  type MilestoneGroup,
  type Progress,
  progressOf,
  sortForBoard,
} from "./board.js";
import { type ActFn, CardList, type OpenFn } from "./ItemViews.js";
import { type CardModel, type Ctx, cardOf, hrefFor, type ItemRef, refKey } from "./items.js";
import { dLabel } from "./labels.js";
import { dDay, dueFromKstDate } from "./today.js";

function Bar({ p, label }: { p: Progress; label: string }) {
  const done = p.total ? (p.done / p.total) * 100 : 0;
  const doing = p.total ? (p.doing / p.total) * 100 : 0;
  return (
    <div className="bar-row">
      <div className="bar" aria-hidden="true">
        <span className="bar-done" style={{ width: `${done}%` }} />
        <span className="bar-doing" style={{ width: `${doing}%` }} />
      </div>
      <span className="bar-text">{label}</span>
    </div>
  );
}

const progressLabel = (p: Progress) =>
  p.total === 0
    ? "할 일 없음"
    : `${p.done}/${p.total} 끝${p.doing ? ` · 하는 중 ${p.doing}` : ""} · ${p.percent}%`;

export function Board({
  ctx,
  projectId,
  onProject,
  onOpen,
  onAction,
  openRef,
  onReload,
  onError,
}: {
  ctx: Ctx;
  projectId: string | null;
  onProject: (id: string) => void;
  onOpen: OpenFn;
  onAction: ActFn;
  openRef: ItemRef | null;
  onReload: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const project = ctx.projects.find((p) => p.id === projectId) ?? ctx.projects[0];
  if (!project) return <NewProject onDone={onReload} onError={onError} onCreated={onProject} />;

  const groups = groupBoard(project.id, ctx.milestones, ctx.tasks);
  const all = progressOf(ctx.tasks.filter((t) => t.projectId === project.id && !t.deletedAt));
  const next = groups.find((g) => g.next)?.milestone;
  const msRefs: ItemRef[] = groups.flatMap((g) =>
    g.milestone ? [{ type: "milestone" as const, id: g.milestone.id }] : [],
  );

  return (
    <>
      <section className="card board-head" aria-labelledby="board-title">
        {ctx.projects.length > 1 && (
          <fieldset className="seg wrap" aria-label="프로젝트">
            {ctx.projects.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={p.id === project.id}
                onClick={() => onProject(p.id)}
              >
                {p.name}
              </button>
            ))}
          </fieldset>
        )}
        <h2 id="board-title">{project.name}</h2>
        <Bar p={all} label={progressLabel(all)} />
        {next && (
          <p className="meta">
            다음 마일스톤 <strong>{next.name}</strong>
            {next.dueAt && <span className="chip">{dLabel(dDay(next.dueAt, ctx.now))}</span>}
          </p>
        )}
      </section>

      <ol className="milestones">
        {groups.map((g) => (
          <MilestoneSection
            key={g.milestone?.id ?? "none"}
            g={g}
            ctx={ctx}
            msRefs={msRefs}
            onOpen={onOpen}
            onAction={onAction}
            openRef={openRef}
          />
        ))}
      </ol>

      <AddToBoard
        key={project.id}
        project={project}
        ctx={ctx}
        onDone={onReload}
        onError={onError}
      />
    </>
  );
}

function MilestoneSection({
  g,
  ctx,
  msRefs,
  onOpen,
  onAction,
  openRef,
}: {
  g: MilestoneGroup;
  ctx: Ctx;
  msRefs: ItemRef[];
  onOpen: OpenFn;
  onAction: ActFn;
  openRef: ItemRef | null;
}) {
  const [showDone, setShowDone] = useState(false);
  const m = g.milestone;
  const ref: ItemRef | null = m ? { type: "milestone", id: m.id } : null;
  const sorted = sortForBoard(g.tasks);
  const doneCount = sorted.filter((t) => t.status === "done").length;
  const visible = showDone ? sorted : sorted.filter((t) => t.status !== "done");
  const cards = visible
    .map((t): CardModel | null => {
      const c = cardOf(ctx, { type: "task", id: t.id });
      if (!c) return null;
      return {
        ...c,
        // 보드 안에서는 「할 일」이 기본이라 상태 칩을 빼고, 하는 중·끝만 남긴다. 프로젝트 이름도 위에 있으니 뺀다
        status: t.status === "todo" ? undefined : c.status,
        meta: undefined,
        quickAction: t.status !== "done" ? { id: "done", label: "끝냄" } : undefined,
      };
    })
    .filter((c): c is CardModel => !!c);
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!ref || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    onOpen(ref, msRefs, e.currentTarget);
  };
  const selected = !!ref && !!openRef && refKey(ref) === refKey(openRef);
  const headId = `ms-${m?.id ?? "none"}`;

  return (
    <li
      className={`card ms ${g.next ? "next" : ""} ${selected ? "selected" : ""}`}
      data-ref={ref ? refKey(ref) : undefined}
      aria-labelledby={headId}
    >
      <div className="ms-head">
        <h3 id={headId}>
          {ref && m ? (
            <a
              className="ms-link"
              href={hrefFor(ref)}
              onClick={click}
              aria-current={selected || undefined}
            >
              {m.name}
            </a>
          ) : (
            <span className="muted">마일스톤 없음</span>
          )}
        </h3>
        {g.next && <span className="chip tone-info">다음</span>}
        {m?.dueAt && g.progress.done !== g.progress.total && (
          <span className={`chip ${dDay(m.dueAt, ctx.now) < 0 ? "tone-fail" : ""}`}>
            {dLabel(dDay(m.dueAt, ctx.now))}
          </span>
        )}
      </div>
      {m && g.progress.total > 0 && <Bar p={g.progress} label={progressLabel(g.progress)} />}
      <CardList
        cards={cards}
        onOpen={onOpen}
        onAction={onAction}
        openRef={openRef}
        empty={doneCount > 0 ? "남은 할 일이 없습니다" : "속한 할 일이 없습니다"}
      />
      {doneCount > 0 && (
        <button
          type="button"
          className="ghost small"
          aria-expanded={showDone}
          onClick={() => setShowDone(!showDone)}
        >
          끝난 {doneCount}개 {showDone ? "숨기기" : "보기"}
        </button>
      )}
    </li>
  );
}

// 보드 맨 아래: 마일스톤 넣기 · 이 프로젝트에 할 일 넣기
function AddToBoard({
  project,
  ctx,
  onDone,
  onError,
}: {
  project: Project;
  ctx: Ctx;
  onDone: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [msName, setMsName] = useState("");
  const [msDue, setMsDue] = useState("");
  const [title, setTitle] = useState("");
  const [msId, setMsId] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = ctx.milestones.filter((m) => m.projectId === project.id);

  const go = async (e: FormEvent, fn: () => Promise<unknown>, reset: () => void) => {
    e.preventDefault();
    setBusy(true);
    try {
      await fn();
      reset();
      await onDone();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <p className="label">마일스톤 넣기</p>
      <form
        className="add"
        onSubmit={(e) =>
          go(
            e,
            () =>
              api.createMilestone(project.id, {
                name: msName.trim(),
                dueAt: msDue ? dueFromKstDate(msDue) : undefined,
              }),
            () => {
              setMsName("");
              setMsDue("");
            },
          )
        }
      >
        <input
          aria-label="마일스톤 이름"
          placeholder="예: 첫 화면 공개"
          value={msName}
          maxLength={100}
          onChange={(e) => setMsName(e.target.value)}
        />
        <input
          aria-label="목표 날짜"
          type="date"
          value={msDue}
          onChange={(e) => setMsDue(e.target.value)}
        />
        <button type="submit" className="primary" disabled={busy || !msName.trim()}>
          넣기
        </button>
      </form>

      <p className="label spaced">이 프로젝트에 할 일 넣기</p>
      <form
        className="add"
        onSubmit={(e) =>
          go(
            e,
            () =>
              api.createTask({
                projectId: project.id,
                title: title.trim(),
                ...(msId ? { milestoneId: msId } : {}),
              }),
            () => setTitle(""),
          )
        }
      >
        <input
          aria-label="할 일"
          placeholder="무엇을 할까요"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
        />
        {mine.length > 0 && (
          <select aria-label="마일스톤" value={msId} onChange={(e) => setMsId(e.target.value)}>
            <option value="">마일스톤 없음</option>
            {mine.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        <button type="submit" className="primary" disabled={busy || !title.trim()}>
          넣기
        </button>
      </form>
    </section>
  );
}

function NewProject({
  onDone,
  onError,
  onCreated,
}: {
  onDone: () => Promise<void>;
  onError: (m: string) => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const p = await api.createProject(name.trim());
      onCreated(p.id);
      await onDone();
    } catch (err) {
      onError((err as Error).message);
    }
  };
  return (
    <section className="card">
      <h2>프로젝트가 아직 없습니다</h2>
      <p className="muted">프로젝트를 하나 만들면 마일스톤을 넣을 수 있습니다.</p>
      <form className="add" onSubmit={submit}>
        <input
          aria-label="프로젝트 이름"
          placeholder="프로젝트 이름"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="primary" disabled={!name.trim()}>
          만들기
        </button>
      </form>
    </section>
  );
}
