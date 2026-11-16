// sql.js(브라우저 안 SQLite) 를 better-sqlite3 처럼 쓰게 하는 얇은 껍데기.
// 저장소(src/db/store.ts)가 쓰는 것만: prepare().run/get/all, exec, transaction
import type { Database as SqlJsDb } from "sql.js";

type Row = Record<string, unknown>;

class Statement {
  constructor(
    private readonly db: SqlJsDb,
    private readonly sql: string,
  ) {}

  private bind(args: unknown[]) {
    return args.map((a) => (a === undefined ? null : typeof a === "boolean" ? Number(a) : a)) as (
      | string
      | number
      | null
      | Uint8Array
    )[];
  }

  run(...args: unknown[]) {
    const st = this.db.prepare(this.sql);
    try {
      st.run(this.bind(args));
    } finally {
      st.free();
    }
    const changes = this.db.getRowsModified();
    const id = this.db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] ?? 0;
    return { changes, lastInsertRowid: id as number };
  }

  all(...args: unknown[]): Row[] {
    const st = this.db.prepare(this.sql);
    const out: Row[] = [];
    try {
      st.bind(this.bind(args));
      while (st.step()) out.push(st.getAsObject() as Row);
    } finally {
      st.free();
    }
    return out;
  }

  get(...args: unknown[]): Row | undefined {
    return this.all(...args)[0];
  }
}

export class BrowserDb {
  private depth = 0;
  constructor(readonly raw: SqlJsDb) {
    raw.exec("PRAGMA foreign_keys = ON");
  }

  prepare(sql: string) {
    return new Statement(this.raw, sql);
  }

  exec(sql: string) {
    this.raw.exec(sql);
    return this;
  }

  pragma(sql: string) {
    return this.raw.exec(`PRAGMA ${sql}`);
  }

  // better-sqlite3 처럼: 감싼 함수를 돌려주고, 부르면 한 묶음으로 저장. 안에서 또 부르면 저장점으로
  transaction<A extends unknown[], R>(fn: (...a: A) => R) {
    return (...a: A): R => {
      const name = `sp${this.depth}`;
      this.raw.exec(this.depth === 0 ? "BEGIN" : `SAVEPOINT ${name}`);
      this.depth++;
      try {
        const out = fn(...a);
        this.depth--;
        this.raw.exec(this.depth === 0 ? "COMMIT" : `RELEASE ${name}`);
        return out;
      } catch (err) {
        this.depth--;
        this.raw.exec(this.depth === 0 ? "ROLLBACK" : `ROLLBACK TO ${name}; RELEASE ${name}`);
        throw err;
      }
    };
  }
}
