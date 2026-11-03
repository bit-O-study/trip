// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { planMoveBefore, planMoveDown, planMoveUp } from "@/features/trips/reorder";
import type { ItineraryItem } from "@/features/trips/types";
import { USER, createTestDb, type TestDb } from "@/test/db/harness";

/**
 * reorder 계획 → 실제 trip.move_item 까지 이어서 확인한다.
 *
 * sort_order 는 하루 안에서 시각 순서와 단조롭지 않다 (새 항목은 시각과 무관하게
 * 그날 max+1000). 시각이 다른 항목을 기준으로 잡던 예전 계획은 move_item 이
 * 같은 자리로 되돌려 "이동했습니다"인데 아무 변화가 없었다.
 */
const TZ = "Asia/Tokyo";
let db: TestDb;
let tripId: string;

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db?.pg.close();
});

beforeEach(async () => {
  await db.truncateAll();
  for (const id of Object.values(USER)) await db.createUser(id);
  await db.asUser(USER.owner);
  const inserted = await db.pg.query<{ id: string }>(
    `insert into trip.trips (owner_id, title, start_date, end_date, timezone)
     values ($1, '도쿄', '2026-02-14', '2026-02-18', $2) returning id`,
    [USER.owner, TZ],
  );
  tripId = inserted.rows[0].id;
});

async function add(title: string, startAt: string) {
  await db.pg.query(
    `insert into trip.itinerary_items (trip_id, created_by, type, title, start_at, sort_order)
     values ($1, (select auth.uid()), 'activity', $2, $3, trip.next_sort_order($1, $3))`,
    [tripId, title, startAt],
  );
}

async function load(): Promise<ItineraryItem[]> {
  const rows = await db.pg.query<{ id: string; title: string; start_at: Date; sort_order: string }>(
    `select id, title, start_at, sort_order from trip.itinerary_items
     where trip_id = $1 and deleted_at is null order by start_at, sort_order, id`,
    [tripId],
  );
  return rows.rows.map(
    (row) =>
      ({
        id: row.id,
        title: row.title,
        startAt: new Date(row.start_at).toISOString(),
        sortOrder: Number(row.sort_order),
      }) as ItineraryItem,
  );
}

async function move(plan: { startAt: string; afterItemId: string | null } | null, itemId: string) {
  expect(plan).not.toBeNull();
  await db.pg.query("select trip.move_item($1, $2, $3)", [itemId, plan!.startAt, plan!.afterItemId]);
}

const titles = (items: ItineraryItem[]) => items.map((item) => item.title);

async function seedNonMonotonic() {
  // 등록 순서 X(10:00) → W(09:00) → Y(10:00): sort_order 는 X 1000, W 2000, Y 3000.
  await add("X", "2026-02-14T01:00:00Z");
  await add("W", "2026-02-14T00:00:00Z");
  await add("Y", "2026-02-14T01:00:00Z");
  expect(titles(await load())).toEqual(["W", "X", "Y"]);
}

describe("move_item 과 함께 쓰는 이동 계획", () => {
  it("위로 이동이 시각이 다른 앞 항목 때문에 무변화가 되지 않는다", async () => {
    await seedNonMonotonic();
    const before = await load();
    const y = before.find((item) => item.title === "Y")!;
    await move(planMoveUp(before, y.id, TZ), y.id);
    expect(titles(await load())).toEqual(["W", "Y", "X"]);
  });

  it("앞에 놓기도 같은 경우에 실제로 순서가 바뀐다", async () => {
    await seedNonMonotonic();
    const before = await load();
    const y = before.find((item) => item.title === "Y")!;
    const x = before.find((item) => item.title === "X")!;
    await move(planMoveBefore(before, y.id, x.id, TZ), y.id);
    expect(titles(await load())).toEqual(["W", "Y", "X"]);
  });

  it("위로 이동을 반복하면 시각을 넘겨받으며 맨 위까지 간다", async () => {
    await seedNonMonotonic();
    let items = await load();
    const y = items.find((item) => item.title === "Y")!;
    await move(planMoveUp(items, y.id, TZ), y.id);
    items = await load();
    await move(planMoveUp(items, y.id, TZ), y.id);
    items = await load();
    expect(titles(items)).toEqual(["Y", "W", "X"]);
    expect(items[0].startAt).toBe("2026-02-14T00:00:00.000Z");
  });

  it("아래로 이동도 실제로 순서가 바뀐다", async () => {
    await seedNonMonotonic();
    const before = await load();
    const w = before.find((item) => item.title === "W")!;
    await move(planMoveDown(before, w.id, TZ), w.id);
    expect(titles(await load())).toEqual(["X", "W", "Y"]);
  });
});
