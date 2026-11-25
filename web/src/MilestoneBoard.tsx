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
import { dDay, dueFromKstDate, kstDate, type Status } from "./today.js";

// 할 일 하나 = 막대 한 칸. 끝, 하는 중, 멈춤, 남음 순으로 채워 몇 개 남았는지 눈으로 센다.
// 할 일이 너무 많으면(칸이 좁아지면) 예전처럼 비율 막대로
type SegTask = { id: string; title: string; status: Status; blockedReason?: string | null };
const SEG_ORDER = (t: SegTask) =>
  t.status === "done" ? 0 : t.status === "doing" ? 1 : t.blockedReason ? 2 : 3;
const SEG_CLASS = ["tick-done", "tick-doing", "tick-wait", "tick-todo"];
const SEG_WORD = ["끝", "하는 중", "멈춤", "남음"];
const MAX_SEGMENTS = 60;

function Bar({ p, groups, label }: { p: Progress; groups: SegTask[][]; label: string }) {
  const count = groups.reduce((n, g) => n + g.length, 0);
  if (count === 0 || count > MAX_SEGMENTS) {
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
  return (
    <div className="bar-row">
      <div className="tickbar" role="img" aria-label={label}>
        {groups
          .filter((g) => g.length > 0)
          .map((g) => (
            <span className="tick-group" key={g[0]?.id} style={{ flexGrow: g.length }}>
              {[...g]
                .sort((a, b) => SEG_ORDER(a) - SEG_ORDER(b))
                .map((t) => (
                  <span
                    key={t.id}
                    className={`tick ${SEG_CLASS[SEG_ORDER(t)]}`}
                    title={`${SEG_WORD[SEG_ORDER(t)]}: ${t.title}`}
                  />
                ))}
            </span>
          ))}
      </div>
      <span className="bar-text">{label}</span>
    </div>
  );
}

const progressLabel = (p: Progress) =>
  p.total === 0
    ? "할 일 없음"
    : p.done === p.total
      ? `모두 완료, 전체 ${p.total}개`
      : `남은 ${p.total - p.done}개, 전체 ${p.total}개${p.doing ? `, 하는 중 ${p.doing}` : ""}`;

const segOf = (ctx: Ctx, list: { id: string }[]): SegTask[] =>
  list
    .map((x) => ctx.tasks.find((t) => t.id === x.id))
    .filter((t): t is NonNullable<typeof t> => !!t);

// 질문이 열려 있으면 「고르기」(상세에서 답), 정할 것이라고만 멈춘 일은 「정했음」, 그 밖에는 「완료」. 오늘 화면과 같은 규칙
function quickFor(ctx: Ctx, id: string) {
  const t = ctx.tasks.find((x) => x.id === id);
  if (!t || t.status === "done") return undefined;
  if (ctx.decisions?.some((d) => d.taskId === id && !d.answeredAt))
    return { id: "open-decision", label: "고르기" };
  if (t.blockedReason === "my_decision") return { id: "decided", label: "정했음" };
  return { id: "done", label: "완료" };
}

// 프로젝트 이름: 누르면 그 자리에서 고친다. 가져오기는 출처로 프로젝트를 찾으므로 이름을 바꿔도 갈라지지 않는다
function ProjectName({
  project,
  onDone,
  onError,
}: {
  project: Project;
  onDone: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  if (!editing)
    return (
      <div className="name-row">
        <h2 id="board-title">{project.name}</h2>
        <button type="button" className="ghost small" onClick={() => setEditing(true)}>
          이름 바꾸기
        </button>
      </div>
    );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = name.trim();
    if (!v || v === project.name) return setEditing(false);
    setBusy(true);
    try {
      await api.renameProject(project.id, v);
      await onDone();
      setEditing(false);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="name-row" onSubmit={submit}>
      <input
        aria-label="프로젝트 이름"
        value={name}
        maxLength={100}
        onChange={(e) => setName(e.target.value)}
      />
      <button type="submit" className="small" disabled={busy}>
        저장
      </button>
      <button
        type="button"
        className="ghost small"
        onClick={() => {
          setName(project.name);
          setEditing(false);
        }}
      >
        취소
      </button>
    </form>
  );
}

export function Board({
  ctx,
  trashed,
  projectId,
  onProject,
  onOpen,
  onAction,
  openRef,
  onReload,
  onError,
}: {
  ctx: Ctx;
  trashed: Project[];
  projectId: string | null;
  onProject: (id: string) => void;
  onOpen: OpenFn;
  onAction: ActFn;
  openRef: ItemRef | null;
  onReload: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const project = ctx.projects.find((p) => p.id === projectId) ?? ctx.projects[0];
  const bin = (
    <TrashBin
      trashed={trashed}
      onRevived={(id) => {
        onProject(id);
        return onReload();
      }}
      onError={onError}
    />
  );
  if (!project)
    return (
      <>
        <NewProject onDone={onReload} onError={onError} onCreated={onProject} />
        {bin}
      </>
    );

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
        <ProjectName
          key={`name-${project.id}`}
          project={project}
          onDone={onReload}
          onError={onError}
        />
        <Bar p={all} groups={groups.map((g) => segOf(ctx, g.tasks))} label={progressLabel(all)} />
        {next && (
          <p className="meta">
            다음 마일스톤 <strong>{next.name}</strong>
            {next.dueAt && <span className="chip">{dLabel(dDay(next.dueAt, ctx.now))}</span>}
          </p>
        )}
        <TrashProject
          key={project.id}
          project={project}
          milestones={ctx.milestones.filter((m) => m.projectId === project.id).length}
          tasks={ctx.tasks.filter((t) => t.projectId === project.id && !t.deletedAt).length}
          onTrashed={() => {
            const rest = ctx.projects.find((p) => p.id !== project.id);
            if (rest) onProject(rest.id);
            return onReload();
          }}
          onError={onError}
        />
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
      {bin}
    </>
  );
}

// 프로젝트 휴지통으로: 한 번 더 묻는다 (안의 것도 같이 들어감). 브라우저 확인 창은 쓰지 않는다
function TrashProject({
  project,
  milestones,
  tasks,
  onTrashed,
  onError,
}: {
  project: Project;
  milestones: number;
  tasks: number;
  onTrashed: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!asking)
    return (
      <p className="board-tools">
        <button type="button" className="ghost small danger" onClick={() => setAsking(true)}>
          프로젝트 휴지통으로
        </button>
      </p>
    );
  const go = async () => {
    setBusy(true);
    try {
      await api.trashProject(project.id);
      await onTrashed();
    } catch (err) {
      onError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <fieldset className="confirm" aria-label="프로젝트 휴지통으로">
      <p>
        <strong>{project.name}</strong> 프로젝트
        {milestones || tasks
          ? `와 안의 마일스톤 ${milestones}개, 할 일 ${tasks}개를 휴지통에 넣습니다.`
          : "를 휴지통에 넣습니다."}{" "}
        휴지통에서 되돌리면 같이 돌아옵니다.
      </p>
      <div className="row">
        <button type="button" className="danger" disabled={busy} onClick={go}>
          휴지통에 넣기
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={() => setAsking(false)}>
          그만두기
        </button>
      </div>
    </fieldset>
  );
}

// 휴지통에 든 프로젝트. 되살리면 같이 들어간 마일스톤과 할 일도 돌아온다
function TrashBin({
  trashed,
  onRevived,
  onError,
}: {
  trashed: Project[];
  onRevived: (id: string) => Promise<void>;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!trashed.length) return null;
  const revive = async (id: string) => {
    setBusy(id);
    try {
      await api.reviveProject(id);
      await onRevived(id);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="card trash-bin" aria-labelledby="trash-title">
      <h2 id="trash-title">휴지통</h2>
      <ul className="plain">
        {trashed.map((p) => (
          <li key={p.id} className="row spread">
            <span>
              {p.name}
              {p.deletedAt && (
                <span className="muted"> {kstDate(new Date(p.deletedAt))} 에 넣음</span>
              )}
            </span>
            <button
              type="button"
              className="small"
              disabled={busy === p.id}
              onClick={() => revive(p.id)}
            >
              되돌리기
            </button>
          </li>
        ))}
      </ul>
    </section>
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
        quickAction: quickFor(ctx, t.id),
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
      {m && g.progress.total > 0 && (
        <Bar p={g.progress} groups={[segOf(ctx, g.tasks)]} label={progressLabel(g.progress)} />
      )}
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
