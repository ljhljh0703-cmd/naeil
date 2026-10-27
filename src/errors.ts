// 오류 종류. 저장소·API가 같은 종류를 쓰고, API는 이걸 한 가지 모양(problem+json)으로 바꿔 내보낸다.
// 종류별 설명 = docs/errors.md
export const ERROR_DOCS = "https://github.com/ljhljh0703-cmd/naeil/blob/main/docs/errors.md";

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly slug: string,
    readonly title: string,
    detail?: string,
  ) {
    super(detail ?? title);
  }
}

export class NotFound extends AppError {
  constructor(detail?: string) {
    super(404, "not-found", "없음", detail);
  }
}

export class BadInput extends AppError {
  constructor(detail?: string) {
    super(400, "bad-input", "입력 규칙 위반", detail);
  }
}

export class RuleViolation extends AppError {
  constructor(slug: string, detail: string) {
    super(422, slug, "규칙 위반", detail);
  }
}

export class Duplicate extends AppError {
  constructor(detail: string) {
    super(409, "duplicate-import", "이미 있음", detail);
  }
}

export class VersionMismatch extends AppError {
  constructor() {
    super(
      412,
      "version-mismatch",
      "그 사이 다른 곳에서 먼저 고침",
      "다시 읽고(GET) 새 ETag 로 고치세요",
    );
  }
}

export class Unauthorized extends AppError {
  constructor(detail = "Authorization: Bearer <출입증> 이 없거나 틀림") {
    super(401, "unauthorized", "출입증 없음", detail);
  }
}

export class IdempotencyReused extends AppError {
  constructor() {
    super(
      422,
      "idempotency-key-reused",
      "같은 Idempotency-Key 를 다른 내용으로 다시 보냄",
      "내용이 다르면 새 열쇠를 쓰세요",
    );
  }
}
