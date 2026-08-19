// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { USER, applyMigrations, createTestDb, type TestDb } from "@/test/db/harness";

/**
 * 마이그레이션을 두 번 적용해도 안전한지 확인한다.
 *
 * 이 프로젝트는 DB 자격증명이 없어 대시보드 SQL 에디터로 스키마를 적용한다.
 * 그 방식은 문장 하나가 실패하면 앞선 문장은 이미 적용된 채로 멈춘다.
 * 고친 뒤 통째로 다시 실행할 수 있어야 하므로 모든 문장이 멱등해야 한다.
 *
 * "다시 실행해도 에러가 안 난다" 만으로는 부족하다. 두 번째 실행이 데이터를
 * 날리거나 정책을 지워 버리면 더 나쁘다. 그래서 데이터와 접근 제어가
 * 살아있는지도 함께 본다.
 */

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db?.pg.close();
});

describe("마이그레이션 재실행", () => {
  it("두 번 적용해도 실패하지 않는다", async () => {
    await db.truncateAll();
    await db.asSuperuser();

    await expect(applyMigrations(db.pg)).resolves.toBeUndefined();
  }, 60_000);

  it("재실행해도 기존 데이터가 남는다", async () => {
    await db.truncateAll();
    for (const id of Object.values(USER)) {
      await db.createUser(id);
    }

    await db.asUser(USER.owner);
    const created = await db.pg.query<{ id: string }>(
      `insert into trip.trips (owner_id, title, start_date, end_date)
       values ($1, '재실행 전에 만든 여행', '2026-05-01', '2026-05-03') returning id`,
      [USER.owner],
    );
    const tripId = created.rows[0].id;

    await db.asSuperuser();
    await applyMigrations(db.pg);

    await db.asUser(USER.owner);
    const rows = await db.pg.query<{ title: string }>(
      "select title from trip.trips where id = $1",
      [tripId],
    );
    expect(rows.rows[0]?.title).toBe("재실행 전에 만든 여행");
  }, 60_000);

  it("재실행해도 접근 제어가 그대로다", async () => {
    await db.asSuperuser();
    await applyMigrations(db.pg);

    // 멤버가 아닌 사용자에게는 여전히 보이지 않아야 한다.
    await db.asUser(USER.stranger);
    const rows = await db.pg.query("select id from trip.trips");
    expect(rows.rows).toHaveLength(0);

    // 로그인하지 않은 방문자는 여전히 거부된다.
    await db.asAnon();
    await expect(db.pg.query("select id from trip.trips")).rejects.toThrow(
      /permission denied/i,
    );
  }, 60_000);

  it("재실행해도 정책이 중복 생성되지 않는다", async () => {
    await db.asSuperuser();
    await applyMigrations(db.pg);

    const policies = await db.pg.query<{ count: string }>(
      `select count(*) as count from pg_policies
       where schemaname = 'trip' and tablename = 'trips'`,
    );
    // select / insert / update / delete 네 개.
    expect(Number(policies.rows[0].count)).toBe(4);
  }, 60_000);
});
