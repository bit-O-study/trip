// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { USER, createTestDb, expectDenied, type TestDb } from "@/test/db/harness";

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db?.pg.close();
});

beforeEach(async () => {
  await db.truncateAll();
  for (const id of Object.values(USER)) {
    await db.createUser(id);
  }
});

/** 도쿄 시간대 여행. owner / editor / viewer 가 붙어 있다. */
async function seedTrip(): Promise<string> {
  await db.asUser(USER.owner);
  const inserted = await db.pg.query<{ id: string }>(
    `insert into trip.trips (owner_id, title, start_date, end_date, timezone)
     values ($1, '도쿄', '2026-02-14', '2026-02-18', 'Asia/Tokyo')
     returning id`,
    [USER.owner],
  );
  const tripId = inserted.rows[0].id;

  await db.pg.query(
    `insert into trip.trip_members (trip_id, user_id, role) values ($1, $2, 'editor')`,
    [tripId, USER.editor],
  );
  await db.pg.query(
    `insert into trip.trip_members (trip_id, user_id, role) values ($1, $2, 'viewer')`,
    [tripId, USER.viewer],
  );
  return tripId;
}

async function addItem(tripId: string, title: string, startAt: string, sortOrder?: number) {
  const result = await db.pg.query<{ id: string }>(
    `insert into trip.itinerary_items (trip_id, created_by, type, title, start_at, sort_order)
     values ($1, (select auth.uid()), 'activity', $2, $3,
             coalesce($4::numeric, trip.next_sort_order($1, $3)))
     returning id`,
    [tripId, title, startAt, sortOrder ?? null],
  );
  return result.rows[0].id;
}

async function dayOrder(tripId: string) {
  const rows = await db.pg.query<{ title: string; sort_order: string }>(
    `select title, sort_order from trip.itinerary_items
     where trip_id = $1 and deleted_at is null
     order by start_at, sort_order`,
    [tripId],
  );
  return rows.rows.map((row) => row.title);
}

describe("next_sort_order", () => {
  it("첫 항목은 1000 에서 시작한다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.editor);

    const result = await db.pg.query<{ next: string }>(
      "select trip.next_sort_order($1, $2) as next",
      [tripId, "2026-02-14T01:00:00Z"],
    );
    expect(Number(result.rows[0].next)).toBe(1000);
  });

  it("같은 날짜에는 1000 씩 늘어난다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.editor);
    await addItem(tripId, "A", "2026-02-14T01:00:00Z");
    await addItem(tripId, "B", "2026-02-14T05:00:00Z");

    const result = await db.pg.query<{ next: string }>(
      "select trip.next_sort_order($1, $2) as next",
      [tripId, "2026-02-14T08:00:00Z"],
    );
    expect(Number(result.rows[0].next)).toBe(3000);
  });

  it("날짜가 다르면 다시 1000 에서 시작한다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.editor);
    await addItem(tripId, "A", "2026-02-14T01:00:00Z");

    const result = await db.pg.query<{ next: string }>(
      "select trip.next_sort_order($1, $2) as next",
      [tripId, "2026-02-15T01:00:00Z"],
    );
    expect(Number(result.rows[0].next)).toBe(1000);
  });

  it("여행 시간대 기준으로 날짜를 가른다", async () => {
    // 2026-02-14T16:00Z 는 UTC 로는 14일이지만 도쿄에서는 15일 01:00 이다.
    // UTC 기준으로 자르면 Day 가 하루 밀린다.
    const tripId = await seedTrip();
    await db.asUser(USER.editor);
    await addItem(tripId, "도쿄 14일 밤", "2026-02-14T13:00:00Z"); // 도쿄 14일 22:00

    const sameDay = await db.pg.query<{ next: string }>(
      "select trip.next_sort_order($1, $2) as next",
      [tripId, "2026-02-14T14:00:00Z"], // 도쿄 14일 23:00
    );
    expect(Number(sameDay.rows[0].next)).toBe(2000);

    const nextDay = await db.pg.query<{ next: string }>(
      "select trip.next_sort_order($1, $2) as next",
      [tripId, "2026-02-14T16:00:00Z"], // 도쿄 15일 01:00
    );
    expect(Number(nextDay.rows[0].next)).toBe(1000);
  });

  it("멤버가 아니면 여행을 찾지 못한다", async () => {
    const tripId = await seedTrip();

    await db.asUser(USER.stranger);
    const message = await expectDenied(() =>
      db.pg.query("select trip.next_sort_order($1, $2)", [tripId, "2026-02-14T01:00:00Z"]),
    );
    expect(message).toMatch(/not found or not visible/i);
  });
});

describe("move_item", () => {
  it("맨 앞으로 옮기면 첫 항목보다 작은 값을 받는다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.editor);
    await addItem(tripId, "A", "2026-02-14T01:00:00Z");
    await addItem(tripId, "B", "2026-02-14T02:00:00Z");
    const c = await addItem(tripId, "C", "2026-02-14T03:00:00Z");

    await db.pg.query("select trip.move_item($1, $2, null)", [c, "2026-02-14T00:30:00Z"]);

    expect(await dayOrder(tripId)).toEqual(["C", "A", "B"]);
  });

  it("지정한 항목 바로 뒤로 옮긴다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.editor);
    const a = await addItem(tripId, "A", "2026-02-14T01:00:00Z");
    await addItem(tripId, "B", "2026-02-14T02:00:00Z");
    const c = await addItem(tripId, "C", "2026-02-14T03:00:00Z");

    // C 를 A 바로 뒤(= B 앞)로. 시각도 그에 맞춘다.
    await db.pg.query("select trip.move_item($1, $2, $3)", [c, "2026-02-14T01:30:00Z", a]);

    expect(await dayOrder(tripId)).toEqual(["A", "C", "B"]);
  });

  it("다른 날짜로 옮길 수 있다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.editor);
    const a = await addItem(tripId, "A", "2026-02-14T01:00:00Z");
    await addItem(tripId, "B", "2026-02-15T01:00:00Z");

    await db.pg.query("select trip.move_item($1, $2, null)", [a, "2026-02-15T00:30:00Z"]);

    const rows = await db.pg.query<{ title: string; sort_order: string }>(
      `select title, sort_order from trip.itinerary_items
       where trip_id = $1 order by start_at`,
      [tripId],
    );
    expect(rows.rows.map((r) => r.title)).toEqual(["A", "B"]);
    // 옮긴 날짜의 첫 항목(B, 1000)보다 앞이어야 한다.
    expect(Number(rows.rows[0].sort_order)).toBeLessThan(1000);
  });

  it("자기 자신을 이웃으로 잡지 않는다", async () => {
    // 자신을 제외하지 않으면 sort_order 가 자기 값 쪽으로 수렴해 순서가 무너진다.
    const tripId = await seedTrip();
    await db.asUser(USER.editor);
    const a = await addItem(tripId, "A", "2026-02-14T01:00:00Z");
    const b = await addItem(tripId, "B", "2026-02-14T02:00:00Z");

    await db.pg.query("select trip.move_item($1, $2, $3)", [b, "2026-02-14T01:30:00Z", a]);
    const result = await db.pg.query<{ sort_order: string }>(
      "select sort_order from trip.itinerary_items where id = $1",
      [b],
    );
    // A(1000) 뒤, 다른 항목 없음 → 2000
    expect(Number(result.rows[0].sort_order)).toBe(2000);
  });

  it("간격이 바닥나면 그 날짜만 재번호화한다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.editor);
    const a = await addItem(tripId, "A", "2026-02-14T01:00:00Z", 1000);
    // 임계값(0.000001)보다 좁은 간격을 일부러 만든다.
    await addItem(tripId, "B", "2026-02-14T02:00:00Z", 1000.0000001);
    const c = await addItem(tripId, "C", "2026-02-14T03:00:00Z", 5000);
    // 다른 날짜 항목은 재번호화 대상이 아니다.
    await addItem(tripId, "다음날", "2026-02-15T01:00:00Z", 7777);

    await db.pg.query("select trip.move_item($1, $2, $3)", [c, "2026-02-14T01:30:00Z", a]);

    const rows = await db.pg.query<{ title: string; sort_order: string }>(
      `select title, sort_order from trip.itinerary_items
       where trip_id = $1 order by start_at, sort_order`,
      [tripId],
    );

    // 순서가 보존되고, 그 날짜 값들이 다시 벌어져야 한다.
    const day1 = rows.rows.filter((r) => r.title !== "다음날");
    expect(day1.map((r) => r.title)).toEqual(["A", "C", "B"]);
    const gaps = day1.map((r) => Number(r.sort_order));
    expect(gaps[1] - gaps[0]).toBeGreaterThan(1);
    expect(gaps[2] - gaps[1]).toBeGreaterThan(1);

    // 다른 날짜는 건드리지 않았다.
    const other = rows.rows.find((r) => r.title === "다음날");
    expect(Number(other?.sort_order)).toBe(7777);
  });

  it("다른 날짜의 항목을 기준으로 지정하면 거부한다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.editor);
    const a = await addItem(tripId, "A", "2026-02-14T01:00:00Z");
    const b = await addItem(tripId, "B", "2026-02-15T01:00:00Z");

    const message = await expectDenied(() =>
      db.pg.query("select trip.move_item($1, $2, $3)", [b, "2026-02-15T02:00:00Z", a]),
    );
    expect(message).toMatch(/not on the same day/i);
  });

  it("viewer 는 순서를 바꿀 수 없다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.editor);
    const a = await addItem(tripId, "A", "2026-02-14T01:00:00Z");

    await db.asUser(USER.viewer);
    const message = await expectDenied(() =>
      db.pg.query("select trip.move_item($1, $2, null)", [a, "2026-02-14T02:00:00Z"]),
    );
    expect(message).toMatch(/not allowed to move/i);
  });

  it("멤버가 아니면 항목을 찾지 못한다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.editor);
    const a = await addItem(tripId, "A", "2026-02-14T01:00:00Z");

    await db.asUser(USER.stranger);
    const message = await expectDenied(() =>
      db.pg.query("select trip.move_item($1, $2, null)", [a, "2026-02-14T02:00:00Z"]),
    );
    expect(message).toMatch(/not found or not visible/i);
  });

  it("삭제된 항목은 옮길 수 없다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.editor);
    const a = await addItem(tripId, "A", "2026-02-14T01:00:00Z");
    await db.pg.query("update trip.itinerary_items set deleted_at = now() where id = $1", [a]);

    const message = await expectDenied(() =>
      db.pg.query("select trip.move_item($1, $2, null)", [a, "2026-02-14T02:00:00Z"]),
    );
    expect(message).toMatch(/not found or not visible/i);
  });
});
