// 카드와 상세 칸을 그리는 공통 부품. 종류별 화면은 만들지 않고 items.ts 의 모양만 받는다.
import { type MouseEvent, useEffect, useRef } from "react";
import {
  type Action,
  type CardModel,
  type DetailModel,
  hrefFor,
  type ItemRef,
  refKey,
  type Section,
} from "./items.js";
import { timeOf } from "./labels.js";

export type OpenFn = (ref: ItemRef, list: ItemRef[], opener: HTMLElement) => void;

// 카드 전체를 누를 수 있게. 제목은 진짜 링크(새 탭·주소 복사 가능), 그 위에 덮개를 늘려 카드 어디를 눌러도 열린다.
// 카드 안 버튼은 덮개 위로 올린다 (버튼 안에 버튼을 넣지 않는다).
export function ItemCard({
  card,
  list,
  onOpen,
  onAction,
  selected,
}: {
  card: CardModel;
  list: ItemRef[];
  onOpen: OpenFn;
  onAction?: (ref: ItemRef, action: Action) => void;
  selected?: boolean;
}) {
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // 새 탭은 브라우저에 맡김
    e.preventDefault();
    onOpen(card.ref, list, e.currentTarget);
  };
  return (
    <li className={`item-card ${selected ? "selected" : ""}`} data-ref={refKey(card.ref)}>
      <a
        className="card-link"
        href={hrefFor(card.ref)}
        onClick={click}
        aria-current={selected || undefined}
      >
        {card.title}
      </a>
      {(card.status || card.chips?.length || card.meta) && (
        <span className="card-meta">
          {card.status && (
            <span className={`chip tone-${card.status.tone ?? "neutral"}`}>
              {card.status.label}
            </span>
          )}
          {card.chips?.map((c) => (
            <span key={c.label} className={`chip tone-${c.tone ?? "neutral"}`}>
              {c.label}
            </span>
          ))}
          {card.meta && <span className="meta-text">{card.meta}</span>}
        </span>
      )}
      {card.quickAction && onAction && (
        <button
          type="button"
          className="small card-action"
          onClick={() => onAction(card.ref, card.quickAction as Action)}
          aria-label={`「${card.title}」 ${card.quickAction.label}`}
        >
          {card.quickAction.label}
        </button>
      )}
    </li>
  );
}

export function CardList({
  cards,
  onOpen,
  onAction,
  openRef,
  empty,
}: {
  cards: CardModel[];
  onOpen: OpenFn;
  onAction?: (ref: ItemRef, action: Action) => void;
  openRef: ItemRef | null;
  empty: string;
}) {
  if (cards.length === 0) return <p className="muted">{empty}</p>;
  const list = cards.map((c) => c.ref);
  return (
    <ul className="cards">
      {cards.map((c) => (
        <ItemCard
          key={refKey(c.ref)}
          card={c}
          list={list}
          onOpen={onOpen}
          onAction={onAction}
          selected={!!openRef && refKey(openRef) === refKey(c.ref)}
        />
      ))}
    </ul>
  );
}

function SectionView({
  s,
  onOpen,
  onAction,
  itemRef,
}: {
  s: Section;
  onOpen: OpenFn;
  onAction: (ref: ItemRef, action: Action) => void;
  itemRef: ItemRef;
}) {
  return (
    <section className={`d-section d-${s.kind}`} aria-label={"title" in s ? s.title : undefined}>
      {"title" in s && s.title && <h3>{s.title}</h3>}
      {s.kind === "actions" && (
        <div className="row">
          {s.actions.map((a) => (
            <button
              key={a.id}
              type="button"
              className={
                a.tone === "primary" ? "primary" : a.tone === "danger" ? "ghost danger" : ""
              }
              onClick={() => onAction(itemRef, a)}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      {s.kind === "fields" && (
        <dl className="fields">
          {s.fields.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {s.kind === "body" && (
        <>
          {s.note && <p className="note">{s.note}</p>}
          {/* 글은 글자로만 보인다. 바깥 글 안의 태그가 화면에서 실행되지 않게 */}
          <p className="body-text">{s.text}</p>
        </>
      )}
      {s.kind === "timeline" && (
        <ol className="timeline">
          {s.events.map((e) => (
            <li key={`${e.at}-${e.text}`}>
              <span className="when">{timeOf(e.at)}</span>
              {e.who && <span className="who">{e.who}</span>}
              <span>{e.text}</span>
            </li>
          ))}
        </ol>
      )}
      {s.kind === "list" && <CardList cards={s.items} onOpen={onOpen} openRef={null} empty="" />}
    </section>
  );
}

// 상세 칸. PC 는 오른쪽 옆 패널(뒤 목록을 계속 누를 수 있음), 폰은 전체 화면. full 이면 페이지 하나로.
export function DetailPanel({
  detail,
  position,
  onClose,
  onMove,
  onOpen,
  onAction,
  onExpand,
  full,
}: {
  detail: DetailModel | null;
  position: { index: number; total: number } | null;
  onClose: () => void;
  onMove: (step: 1 | -1) => void;
  onOpen: OpenFn;
  onAction: (ref: ItemRef, action: Action) => void;
  onExpand: (ref: ItemRef) => void;
  full: boolean;
}) {
  const head = useRef<HTMLHeadingElement>(null);
  const key = detail ? refKey(detail.ref) : "";
  // 열리거나 다른 항목으로 바뀌면 제목으로 포커스 (키보드 사용자가 열린 걸 알게)
  // biome-ignore lint/correctness/useExhaustiveDependencies: key 가 바뀔 때만
  useEffect(() => {
    head.current?.focus();
  }, [key]);

  return (
    <aside className={full ? "detail full" : "detail"} aria-labelledby="detail-title">
      <div className="detail-head">
        <span className="kind">{detail?.kindLabel ?? ""}</span>
        <div className="head-actions">
          {position && position.total > 1 && (
            <>
              <span className="pos">
                {position.index + 1} / {position.total}
              </span>
              <button
                type="button"
                className="icon"
                onClick={() => onMove(-1)}
                aria-label="이전 항목 (K)"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4 10l4-4 4 4" />
                </svg>
              </button>
              <button
                type="button"
                className="icon"
                onClick={() => onMove(1)}
                aria-label="다음 항목 (J)"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4 6l4 4 4-4" />
                </svg>
              </button>
            </>
          )}
          {detail && !full && (
            <button
              type="button"
              className="icon"
              aria-label="크게 보기"
              onClick={() => onExpand(detail.ref)}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M9 3h4v4M7 13H3V9M13 3L9 7M3 13l4-4" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className="icon"
            onClick={onClose}
            aria-label={full ? "오늘 화면으로" : "닫기 (Esc)"}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>
      {detail ? (
        <div className="detail-body">
          <h2 id="detail-title" ref={head} tabIndex={-1}>
            {detail.title}
          </h2>
          {(detail.status || detail.meta) && (
            <p className="meta">
              {detail.status && (
                <span className={`chip tone-${detail.status.tone ?? "neutral"}`}>
                  {detail.status.label}
                </span>
              )}
              {detail.meta}
            </p>
          )}
          {detail.sections.map((s) => (
            <SectionView
              key={s.id}
              s={s}
              onOpen={onOpen}
              onAction={onAction}
              itemRef={detail.ref}
            />
          ))}
        </div>
      ) : (
        <div className="detail-body">
          <h2 id="detail-title" ref={head} tabIndex={-1}>
            찾을 수 없습니다
          </h2>
          <p className="muted">휴지통에 들어갔거나 지워진 항목입니다.</p>
        </div>
      )}
    </aside>
  );
}
