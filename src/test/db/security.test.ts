// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { USER, createTestDb, expectDenied, type TestDb } from "@/test/db/harness";

/**
 * 보안 점검(2026-10-23)에서 PGlite 프로브로 재현한 구멍들의 회귀 테스트.
 *
 * 각 테스트 이름 앞의 P 번호는 점검 프로브(P1–P16)의 번호다. 모두 마이그레이션
 * 20261023000001 / 20261023000002 적용 전에는 실패하고, 적용 후에는 통과한다.
 */

let db: TestDb;

const EXTRA = {
  sock1: "00000000-0000-4000-8000-000000000006",
  sock2: "00000000-0000-4000-8000-000000000007",
} as const;

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db?.pg.close();
});

beforeEach(async () => {
  await db.truncateAll();
  for (const id of [...Object.values(USER), ...Object.values(EXTRA)]) {
    await db.createUser(id);
  }
});

type Role = "owner" | "editor" | "viewer";

/** owner 로 여행을 만들고 멤버를 붙인다. 끝나면 owner 로 로그인한 상태다. */
async function seedTrip(owner: string, members: Array<[string, Role]> = [], title = "여행") {
  await db.asUser(owner);
  const inserted = await db.pg.query<{ id: string }>(
    `insert into trip.trips (owner_id, title, start_date, end_date, timezone)
     values ($1, $2, '2027-02-14', '2027-02-18', 'Asia/Tokyo') returning id`,
    [owner, title],
  );
  const tripId = inserted.rows[0].id;
  for (const [userId, role] of members) await db.addMember(tripId, userId, role);
  await db.asUser(owner);
  return tripId;
}

async function seedPoll(user: string, tripId: string) {
  await db.asUser(user);
  const poll = await db.pg.query<{ id: string }>(
    `insert into trip.restaurant_polls (trip_id, title, scheduled_at, closes_at, created_by)
     values ($1, '점심', now() + interval '3 days', now() + interval '1 day', $2) returning id`,
    [tripId, user],
  );
  return poll.rows[0].id;
}

async function seedCandidate(user: string, tripId: string, pollId: string, title = "후보") {
  await db.asUser(user);
  const item = await db.pg.query<{ id: string }>(
    `insert into trip.itinerary_items (trip_id, type, status, title, start_at, restaurant_poll_id)
     values ($1, 'food', 'candidate', $2, now() + interval '3 days', $3) returning id`,
    [tripId, title, pollId],
  );
  return item.rows[0].id;
}

async function vote(user: string, pollId: string, itemId: string) {
  await db.asUser(user);
  await db.pg.query(
    "insert into trip.restaurant_votes (poll_id, item_id, user_id) values ($1, $2, $3)",
    [pollId, itemId, user],
  );
}

async function createInvite(tripId: string, hash: string, role: Role = "editor", by: string = USER.owner) {
  await db.asUser(by);
  await db.pg.query(
    `insert into trip.trip_invites (trip_id, created_by, token_hash, role, max_uses, expires_at)
     values ($1, $2, $3, $4, 20, now() + interval '7 days')`,
    [tripId, by, hash, role],
  );
}

describe("여행 행 — 휴지통·소유자 (editor 권한 상승)", () => {
  it("editor 는 여행을 휴지통으로 보내거나 복구할 수 없다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.editor, "editor"]]);

    await db.asUser(USER.editor);
    const trash = await expectDenied(() =>
      db.pg.query("update trip.trips set deleted_at = now() where id = $1", [tripId]),
    );
    expect(trash).toMatch(/owner/i);

    await db.asUser(USER.owner);
    await db.pg.query("update trip.trips set deleted_at = now() where id = $1", [tripId]);

    await db.asUser(USER.editor);
    await expectDenied(() =>
      db.pg.query("update trip.trips set deleted_at = null where id = $1", [tripId]),
    );

    await db.asUser(USER.owner);
    const restored = await db.pg.query(
      "update trip.trips set deleted_at = null where id = $1 returning id",
      [tripId],
    );
    expect(restored.rows).toHaveLength(1);
  });

  it("editor 는 일반 필드는 고칠 수 있다 (회귀 방지)", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.editor, "editor"]]);
    await db.asUser(USER.editor);
    const updated = await db.pg.query(
      "update trip.trips set title = '바뀐 제목' where id = $1 returning id",
      [tripId],
    );
    expect(updated.rows).toHaveLength(1);
  });

  it("owner_id 는 누구도 직접 바꿀 수 없다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.editor, "editor"]]);
    for (const user of [USER.editor, USER.owner]) {
      await db.asUser(user);
      const message = await expectDenied(() =>
        db.pg.query("update trip.trips set owner_id = $1 where id = $2", [USER.editor, tripId]),
      );
      expect(message).toMatch(/permission denied/i);
    }
  });

  it("P4 공동 owner 가 생성자를 내보내면 생성자는 여행 행을 더 이상 읽지 못한다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.coOwner, "owner"]]);
    await db.asUser(USER.coOwner);
    await db.pg.query("delete from trip.trip_members where trip_id = $1 and user_id = $2", [
      tripId,
      USER.owner,
    ]);

    await db.asUser(USER.owner);
    expect((await db.pg.query("select id from trip.trips where id = $1", [tripId])).rows).toHaveLength(0);

    await db.asSuperuser();
    const owner = await db.pg.query<{ owner_id: string }>(
      "select owner_id from trip.trips where id = $1",
      [tripId],
    );
    expect(owner.rows[0].owner_id).toBe(USER.coOwner);
  });

  it("소유권을 넘기고 강등되면 owner_id 도 새 owner 로 따라간다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.editor, "editor"]]);
    await db.pg.query("update trip.trip_members set role = 'owner' where trip_id = $1 and user_id = $2", [
      tripId,
      USER.editor,
    ]);
    await db.pg.query("update trip.trip_members set role = 'editor' where trip_id = $1 and user_id = $2", [
      tripId,
      USER.owner,
    ]);
    await db.asSuperuser();
    const owner = await db.pg.query<{ owner_id: string }>(
      "select owner_id from trip.trips where id = $1",
      [tripId],
    );
    expect(owner.rows[0].owner_id).toBe(USER.editor);
  });
});

describe("P8 시간대·기간 제약", () => {
  it("존재하지 않는 시간대는 저장할 수 없다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.editor, "editor"]]);
    await db.asUser(USER.editor);
    const message = await expectDenied(() =>
      db.pg.query("update trip.trips set timezone = 'Mars/Base' where id = $1", [tripId]),
    );
    expect(message).toMatch(/trips_timezone_valid/);

    // 여행 전체 RPC 가 계속 동작한다.
    await db.asUser(USER.owner);
    const next = await db.pg.query("select trip.next_sort_order($1, now())", [tripId]);
    expect(next.rows).toHaveLength(1);
  });

  it("0001~9999 처럼 비정상적으로 긴 기간은 저장할 수 없다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.editor, "editor"]]);
    await db.asUser(USER.editor);
    await expectDenied(() =>
      db.pg.query(
        "update trip.trips set start_date = '0001-01-01', end_date = '9999-12-31' where id = $1",
        [tripId],
      ),
    );
    await expectDenied(() =>
      db.pg.query(
        "update trip.trips set start_date = '2027-01-01', end_date = '2028-06-01' where id = $1",
        [tripId],
      ),
    );
    const ok = await db.pg.query(
      "update trip.trips set start_date = '2027-01-01', end_date = '2027-12-31' where id = $1 returning id",
      [tripId],
    );
    expect(ok.rows).toHaveLength(1);
  });

  it("일정 항목의 시간대도 검증한다", async () => {
    const tripId = await seedTrip(USER.owner);
    await expectDenied(() =>
      db.pg.query(
        "insert into trip.itinerary_items (trip_id, type, title, start_at, timezone) values ($1, 'memo', 'x', now(), 'Nowhere/City')",
        [tripId],
      ),
    );
  });
});

describe("멤버 행 — 직접 추가·이동 금지 (P5, P10)", () => {
  it("P10 owner 도 동의 없이 다른 계정을 멤버로 넣을 수 없다", async () => {
    const tripId = await seedTrip(USER.owner);
    const message = await expectDenied(() =>
      db.pg.query("insert into trip.trip_members (trip_id, user_id, role) values ($1, $2, 'viewer')", [
        tripId,
        USER.stranger,
      ]),
    );
    expect(message).toMatch(/permission denied|row-level security/i);

    const profile = await db.pg.query("select user_id from trip.profiles where user_id = $1", [
      USER.stranger,
    ]);
    expect(profile.rows).toHaveLength(0);
  });

  it("P5 owner 행의 trip_id 를 다른 여행으로 옮길 수 없다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.viewer, "viewer"]]);
    const other = await seedTrip(USER.owner, [], "다른 여행");
    const message = await expectDenied(() =>
      db.pg.query("update trip.trip_members set trip_id = $1 where trip_id = $2 and user_id = $3", [
        other,
        tripId,
        USER.owner,
      ]),
    );
    expect(message).toMatch(/permission denied/i);
  });

  it("P5 owner 행의 user_id 를 아무 계정으로 바꿔 owner 로 만들 수 없다", async () => {
    const tripId = await seedTrip(USER.owner);
    await expectDenied(() =>
      db.pg.query("update trip.trip_members set user_id = $1 where trip_id = $2 and user_id = $3", [
        USER.stranger,
        tripId,
        USER.owner,
      ]),
    );
    await db.asUser(USER.stranger);
    expect((await db.pg.query("select id from trip.trips")).rows).toHaveLength(0);
  });
});

describe("음식점 투표 무결성", () => {
  it("P1 editor 는 투표를 자기가 멤버가 아닌 여행으로 옮길 수 없다", async () => {
    const tripA = await seedTrip(USER.owner, [[USER.editor, "editor"]]);
    const victim = await seedTrip(USER.stranger, [], "피해자");
    const pollId = await seedPoll(USER.editor, tripA);

    await db.asUser(USER.editor);
    await expectDenied(() =>
      db.pg.query("update trip.restaurant_polls set trip_id = $1 where id = $2", [victim, pollId]),
    );

    await db.asUser(USER.stranger);
    expect(
      (await db.pg.query("select id from trip.restaurant_polls where trip_id = $1", [victim])).rows,
    ).toHaveLength(0);
  });

  it("P1 editor 는 created_by 를 위조하거나 확정 투표를 다시 열 수 없다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.editor, "editor"]]);
    const pollId = await seedPoll(USER.editor, tripId);
    await db.asUser(USER.editor);
    await expectDenied(() =>
      db.pg.query("update trip.restaurant_polls set created_by = $1 where id = $2", [USER.owner, pollId]),
    );
    await expectDenied(() =>
      db.pg.query("update trip.restaurant_polls set status = 'finalized' where id = $1", [pollId]),
    );

    await db.asSuperuser();
    await db.pg.query(
      "update trip.restaurant_polls set status = 'finalized', finalized_at = now() where id = $1",
      [pollId],
    );
    await db.asUser(USER.editor);
    await expectDenied(() =>
      db.pg.query("update trip.restaurant_polls set status = 'open', finalized_at = null where id = $1", [
        pollId,
      ]),
    );
  });

  it("P1 editor 는 제목·시각은 고칠 수 있다 (회귀 방지)", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.editor, "editor"]]);
    const pollId = await seedPoll(USER.editor, tripId);
    await db.asUser(USER.editor);
    const updated = await db.pg.query(
      "update trip.restaurant_polls set title = '저녁' where id = $1 returning id",
      [pollId],
    );
    expect(updated.rows).toHaveLength(1);
  });

  it("P13 editor 는 이미 확정된 투표나 남의 일정을 승자로 넣을 수 없다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.editor, "editor"]]);
    const other = await seedTrip(USER.stranger, [], "남의 여행");
    await db.asUser(USER.stranger);
    const foreign = await db.pg.query<{ id: string }>(
      "insert into trip.itinerary_items (trip_id, type, title, start_at) values ($1, 'food', '남의 일정', now()) returning id",
      [other],
    );

    await db.asUser(USER.editor);
    await expectDenied(() =>
      db.pg.query(
        `insert into trip.restaurant_polls (trip_id, title, scheduled_at, closes_at, created_by, status, winner_item_id)
         values ($1, 'x', now() + interval '2 days', now() + interval '1 day', $2, 'finalized', $3)`,
        [tripId, USER.editor, foreign.rows[0].id],
      ),
    );
    await expectDenied(() =>
      db.pg.query(
        `insert into trip.restaurant_polls (trip_id, title, scheduled_at, closes_at, created_by)
         values ($1, 'x', now() + interval '2 days', now() + interval '1 day', $2)`,
        [tripId, USER.owner],
      ),
    );

    // superuser 라도 다른 여행의 항목을 승자로 둘 수 없다 (복합 FK).
    const pollId = await seedPoll(USER.editor, tripId);
    await db.asSuperuser();
    await expect(
      db.pg.query("update trip.restaurant_polls set winner_item_id = $1 where id = $2", [
        foreign.rows[0].id,
        pollId,
      ]),
    ).rejects.toThrow(/foreign key/i);
  });

  it("P2 다른 여행의 항목을 남의 투표 후보로 붙일 수 없다", async () => {
    const victimTrip = await seedTrip(USER.owner, [[USER.viewer, "viewer"]], "피해자");
    const pollId = await seedPoll(USER.owner, victimTrip);
    const legit = await seedCandidate(USER.owner, victimTrip, pollId, "피해자 후보");
    await vote(USER.owner, pollId, legit);

    const attackerTrip = await seedTrip(USER.viewer, [
      [EXTRA.sock1, "viewer"],
      [EXTRA.sock2, "viewer"],
    ], "공격자");
    await db.asUser(USER.viewer);
    await expect(
      db.pg.query(
        `insert into trip.itinerary_items (trip_id, type, status, title, start_at, restaurant_poll_id)
         values ($1, 'food', 'candidate', '공격자 식당', now(), $2)`,
        [attackerTrip, pollId],
      ),
    ).rejects.toThrow(/foreign key|row-level security/i);

    await db.asSuperuser();
    await db.pg.query("update trip.restaurant_polls set closes_at = now() - interval '1 second' where id = $1", [
      pollId,
    ]);
    await db.asUser(USER.owner);
    await db.pg.query("select trip.finalize_due_restaurant_polls_for_trip($1)", [victimTrip]);
    const poll = await db.pg.query<{ winner_item_id: string; status: string }>(
      "select winner_item_id, status from trip.restaurant_polls where id = $1",
      [pollId],
    );
    expect(poll.rows[0]).toEqual({ winner_item_id: legit, status: "finalized" });
  });

  it("P3 여행에서 내보내진 투표 생성자는 투표를 지우지 못한다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.editor, "editor"]]);
    const pollId = await seedPoll(USER.editor, tripId);
    const itemId = await seedCandidate(USER.owner, tripId, pollId);
    await db.asUser(USER.owner);
    await db.pg.query("delete from trip.trip_members where trip_id = $1 and user_id = $2", [
      tripId,
      USER.editor,
    ]);

    await db.asUser(USER.editor);
    const removed = await db.pg.query<{ delete_own_restaurant_poll: boolean }>(
      "select trip.delete_own_restaurant_poll($1)",
      [pollId],
    );
    expect(removed.rows[0].delete_own_restaurant_poll).toBe(false);

    await db.asSuperuser();
    expect((await db.pg.query("select id from trip.restaurant_polls where id = $1", [pollId])).rows).toHaveLength(1);
    const item = await db.pg.query<{ deleted_at: Date | null }>(
      "select deleted_at from trip.itinerary_items where id = $1",
      [itemId],
    );
    expect(item.rows[0].deleted_at).toBeNull();
  });

  it("P12 여행을 떠난 멤버의 진행 중 투표 표는 지워지고 집계되지 않는다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.viewer, "viewer"]]);
    const pollId = await seedPoll(USER.owner, tripId);
    const a = await seedCandidate(USER.owner, tripId, pollId, "A");
    const b = await seedCandidate(USER.owner, tripId, pollId, "B");
    await vote(USER.viewer, pollId, b);
    await vote(USER.owner, pollId, a);

    await db.asUser(USER.viewer);
    await db.pg.query("delete from trip.trip_members where trip_id = $1 and user_id = $2", [
      tripId,
      USER.viewer,
    ]);

    await db.asUser(USER.owner);
    const votes = await db.pg.query("select user_id from trip.restaurant_votes where poll_id = $1", [pollId]);
    expect(votes.rows).toEqual([{ user_id: USER.owner }]);
  });

  it("P9 아무 사용자나 전역 마감 함수를 부를 수 없다", async () => {
    await seedTrip(USER.owner);
    await db.asUser(USER.stranger);
    const message = await expectDenied(() => db.pg.query("select trip.finalize_due_restaurant_polls()"));
    expect(message).toMatch(/permission denied/i);
  });

  it("P9 여행별 마감 함수는 멤버만 부를 수 있고 그 여행만 마감한다", async () => {
    const tripA = await seedTrip(USER.owner, [[USER.viewer, "viewer"]]);
    const tripB = await seedTrip(USER.stranger, [], "B");
    const pollA = await seedPoll(USER.owner, tripA);
    const pollB = await seedPoll(USER.stranger, tripB);
    await db.asSuperuser();
    await db.pg.query("update trip.restaurant_polls set closes_at = now() - interval '1 minute'");

    await db.asUser(USER.stranger);
    await expectDenied(() => db.pg.query("select trip.finalize_due_restaurant_polls_for_trip($1)", [tripA]));

    await db.asUser(USER.viewer);
    const count = await db.pg.query<{ n: number }>(
      "select trip.finalize_due_restaurant_polls_for_trip($1) as n",
      [tripA],
    );
    expect(count.rows[0].n).toBe(1);

    await db.asSuperuser();
    const statuses = await db.pg.query<{ id: string; status: string }>(
      "select id, status from trip.restaurant_polls",
    );
    expect(statuses.rows.find((row) => row.id === pollA)?.status).toBe("finalized");
    expect(statuses.rows.find((row) => row.id === pollB)?.status).toBe("open");
  });

  it("서버(service_role)와 cron 은 전역 마감 함수를 계속 쓸 수 있다", async () => {
    await db.asService();
    const result = await db.pg.query("select trip.finalize_due_restaurant_polls()");
    expect(result.rows).toHaveLength(1);
  });
});

describe("P6 계정 삭제", () => {
  it("휴지통 여행의 유일한 owner 도 계정을 지울 수 있고 남은 멤버가 owner 가 된다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.editor, "editor"], [USER.viewer, "viewer"]]);
    await seedPoll(USER.editor, tripId);
    await db.asUser(USER.owner);
    await db.pg.query("update trip.trips set deleted_at = now() where id = $1", [tripId]);

    await db.asSuperuser();
    await db.pg.query("delete from auth.users where id = $1", [USER.owner]);

    const trip = await db.pg.query<{ owner_id: string }>("select owner_id from trip.trips where id = $1", [tripId]);
    expect(trip.rows[0].owner_id).toBe(USER.editor);
    const owners = await db.pg.query("select user_id from trip.trip_members where trip_id = $1 and role = 'owner'", [
      tripId,
    ]);
    expect(owners.rows).toEqual([{ user_id: USER.editor }]);
  });

  it("투표를 만든 적 있는 멤버도 계정을 지울 수 있다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.editor, "editor"]]);
    const pollId = await seedPoll(USER.editor, tripId);
    await db.asSuperuser();
    await db.pg.query("delete from auth.users where id = $1", [USER.editor]);
    const poll = await db.pg.query<{ created_by: string | null }>(
      "select created_by from trip.restaurant_polls where id = $1",
      [pollId],
    );
    expect(poll.rows[0].created_by).toBeNull();
  });

  it("혼자 쓰던 여행은 계정과 함께 사라진다", async () => {
    const tripId = await seedTrip(USER.owner);
    await db.asSuperuser();
    await db.pg.query("delete from auth.users where id = $1", [USER.owner]);
    expect((await db.pg.query("select id from trip.trips where id = $1", [tripId])).rows).toHaveLength(0);
  });

  it("계정이 남아 있으면 마지막 owner 보호는 그대로다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.editor, "editor"]]);
    await expect(
      db.pg.query("delete from trip.trip_members where trip_id = $1 and user_id = $2", [tripId, USER.owner]),
    ).rejects.toThrow(/last owner/i);
  });
});

describe("P7 초대 링크", () => {
  it("내보낸 멤버는 같은 초대 링크로 다시 들어올 수 없다", async () => {
    const tripId = await seedTrip(USER.owner);
    await createInvite(tripId, "h7");
    await db.asUser(USER.editor);
    await db.pg.query("select trip.accept_invite('h7')");

    await db.asUser(USER.owner);
    await db.pg.query("delete from trip.trip_members where trip_id = $1 and user_id = $2", [tripId, USER.editor]);

    await db.asUser(USER.editor);
    await expectDenied(() => db.pg.query("select trip.accept_invite('h7')"));
    expect(
      (await db.pg.query("select role from trip.trip_members where trip_id = $1 and user_id = $2", [tripId, USER.editor])).rows,
    ).toHaveLength(0);
  });

  it("내보낸 뒤 새로 만든 초대로는 다시 들어올 수 있다", async () => {
    const tripId = await seedTrip(USER.owner);
    await createInvite(tripId, "old");
    await db.asUser(USER.editor);
    await db.pg.query("select trip.accept_invite('old')");
    await db.asUser(USER.owner);
    await db.pg.query("delete from trip.trip_members where trip_id = $1 and user_id = $2", [tripId, USER.editor]);

    await db.asSuperuser();
    // 같은 트랜잭션 시각이 되지 않게 새 초대를 확실히 나중으로 만든다.
    await db.pg.query("update trip.trip_member_removals set removed_at = now() - interval '1 minute'");
    await createInvite(tripId, "new", "viewer");
    await db.asUser(USER.editor);
    const accepted = await db.pg.query<{ accept_invite: string }>("select trip.accept_invite('new')");
    expect(accepted.rows[0].accept_invite).toBe(tripId);
  });

  it("스스로 나간 멤버는 같은 링크로 다시 들어올 수 있다", async () => {
    const tripId = await seedTrip(USER.owner);
    await createInvite(tripId, "self");
    await db.asUser(USER.viewer);
    await db.pg.query("select trip.accept_invite('self')");
    await db.pg.query("delete from trip.trip_members where trip_id = $1 and user_id = $2", [tripId, USER.viewer]);
    const again = await db.pg.query<{ accept_invite: string }>("select trip.accept_invite('self')");
    expect(again.rows[0].accept_invite).toBe(tripId);
  });

  it("휴지통에 있는 여행의 초대는 수락할 수 없다", async () => {
    const tripId = await seedTrip(USER.owner);
    await createInvite(tripId, "trashed");
    await db.pg.query("update trip.trips set deleted_at = now() where id = $1", [tripId]);
    await db.asUser(USER.stranger);
    await expectDenied(() => db.pg.query("select trip.accept_invite('trashed')"));
  });

  it("만든 사람이 더 이상 owner 가 아니면 초대는 무효다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.coOwner, "owner"]]);
    await createInvite(tripId, "demoted", "editor", USER.coOwner);
    await db.asUser(USER.owner);
    await db.pg.query("update trip.trip_members set role = 'viewer' where trip_id = $1 and user_id = $2", [
      tripId,
      USER.coOwner,
    ]);
    await db.asUser(USER.stranger);
    await expectDenied(() => db.pg.query("select trip.accept_invite('demoted')"));
  });

  it("owner 는 초대를 폐기할 수 있고 폐기를 되돌릴 수 없다", async () => {
    const tripId = await seedTrip(USER.owner);
    await createInvite(tripId, "revoke-me");
    await db.pg.query("update trip.trip_invites set revoked_at = now() where trip_id = $1", [tripId]);
    await expectDenied(() =>
      db.pg.query("update trip.trip_invites set revoked_at = null where trip_id = $1", [tripId]),
    );
    await expectDenied(() =>
      db.pg.query("update trip.trip_invites set max_uses = 1000 where trip_id = $1", [tripId]),
    );
    await db.asUser(USER.stranger);
    await expectDenied(() => db.pg.query("select trip.accept_invite('revoke-me')"));
  });

  it("초대를 다른 사람 이름이나 긴 수명으로 만들 수 없다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.coOwner, "owner"]]);
    await db.asUser(USER.owner);
    await expectDenied(() =>
      db.pg.query(
        `insert into trip.trip_invites (trip_id, created_by, token_hash, role, expires_at)
         values ($1, $2, 'spoof', 'viewer', now() + interval '1 day')`,
        [tripId, USER.coOwner],
      ),
    );
    await expectDenied(() =>
      db.pg.query(
        `insert into trip.trip_invites (trip_id, created_by, token_hash, role, expires_at)
         values ($1, $2, 'forever', 'viewer', null)`,
        [tripId, USER.owner],
      ),
    );
  });
});

describe("P11 공유 엔티티 (flights / places)", () => {
  async function seedFlightAs(user: string, tripId: string) {
    await db.asUser(user);
    const saved = await db.pg.query<{ id: string }>(
      "select trip.save_flight($1, $2::jsonb) as id",
      [
        tripId,
        JSON.stringify({
          provider: "manual",
          marketing_flight_number: "KE703",
          flight_number_input: "KE 703",
          flight_number_key: "KE703",
          departure_airport: "ICN",
          departure_timezone: "Asia/Seoul",
          arrival_airport: "NRT",
          arrival_timezone: "Asia/Tokyo",
          scheduled_departure: "2027-02-14T00:00:00Z",
          scheduled_arrival: "2027-02-14T02:00:00Z",
        }),
      ],
    );
    return saved.rows[0].id;
  }

  const PLACE = {
    provider: "google",
    provider_place_id: "ChIJ-popular",
    name: "이치란 신주쿠",
    category_group: "food",
    url: "https://example.com",
    latitude: 35.69,
    longitude: 139.7,
  };

  it("다른 사람의 항공편은 보이지 않는다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.viewer, "viewer"]]);
    const flightId = await seedFlightAs(USER.owner, tripId);
    await db.pg.query(
      "insert into trip.itinerary_items (trip_id, type, title, start_at, flight_id) values ($1, 'flight', 'KE703', now(), $2)",
      [tripId, flightId],
    );

    await db.asUser(USER.stranger);
    expect((await db.pg.query("select id from trip.flights")).rows).toHaveLength(0);

    await db.asUser(USER.viewer);
    expect((await db.pg.query("select id from trip.flights")).rows).toHaveLength(1);
  });

  it("인증 사용자는 flights / places 에 직접 쓸 수 없다", async () => {
    await db.asUser(USER.stranger);
    await expectDenied(() =>
      db.pg.query(
        `insert into trip.places (provider, provider_place_id, name, phone, url, latitude, longitude)
         values ('google', 'ChIJ-popular', '가짜 상호', '010-0000', 'javascript:alert(1)', 0, 0)`,
      ),
    );
    await expectDenied(() =>
      db.pg.query(
        `insert into trip.flights (provider, marketing_flight_number, flight_number_key, departure_airport,
           departure_timezone, arrival_airport, arrival_timezone, scheduled_departure, scheduled_arrival)
         values ('manual', 'KE1', 'KE1', 'ICN', 'Asia/Seoul', 'NRT', 'Asia/Tokyo', now(), now())`,
      ),
    );
  });

  it("save_place 는 편집 권한이 있는 멤버만, 같은 장소는 한 행으로 돌려준다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.editor, "editor"], [USER.viewer, "viewer"]]);

    await db.asUser(USER.viewer);
    await expectDenied(() => db.pg.query("select trip.save_place($1, $2::jsonb)", [tripId, JSON.stringify(PLACE)]));
    await db.asUser(USER.stranger);
    await expectDenied(() => db.pg.query("select trip.save_place($1, $2::jsonb)", [tripId, JSON.stringify(PLACE)]));

    await db.asUser(USER.editor);
    const first = await db.pg.query<{ id: string }>("select trip.save_place($1, $2::jsonb) as id", [
      tripId,
      JSON.stringify(PLACE),
    ]);
    await db.asUser(USER.owner);
    const second = await db.pg.query<{ id: string }>("select trip.save_place($1, $2::jsonb) as id", [
      tripId,
      JSON.stringify({ ...PLACE, name: "덮어쓰기 시도" }),
    ]);
    expect(second.rows[0].id).toBe(first.rows[0].id);

    await db.asSuperuser();
    const name = await db.pg.query<{ name: string }>("select name from trip.places");
    expect(name.rows).toEqual([{ name: "이치란 신주쿠" }]);
  });

  it("장소 url 은 http(s) 만 허용한다", async () => {
    const tripId = await seedTrip(USER.owner);
    await expectDenied(() =>
      db.pg.query("select trip.save_place($1, $2::jsonb)", [
        tripId,
        JSON.stringify({ ...PLACE, provider_place_id: "evil", url: "javascript:alert(1)" }),
      ]),
    );
  });

  it("멤버는 자기 여행 일정이 참조하는 장소만 읽는다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.viewer, "viewer"]]);
    const saved = await db.pg.query<{ id: string }>("select trip.save_place($1, $2::jsonb) as id", [
      tripId,
      JSON.stringify(PLACE),
    ]);
    await db.pg.query(
      "insert into trip.itinerary_items (trip_id, type, title, start_at, place_id) values ($1, 'food', '이치란', now(), $2)",
      [tripId, saved.rows[0].id],
    );
    await db.asUser(USER.viewer);
    expect((await db.pg.query("select id from trip.places")).rows).toHaveLength(1);
    await db.asUser(USER.stranger);
    expect((await db.pg.query("select id from trip.places")).rows).toHaveLength(0);
  });
});

describe("P14 공유 링크", () => {
  it("만료 없는 공유 링크를 만들 수 없다", async () => {
    const tripId = await seedTrip(USER.owner);
    await expectDenied(() =>
      db.pg.query(
        `insert into trip.trip_share_links (trip_id, created_by, token_hash, short_id, expires_at)
         values ($1, $2, 'abc', 's1', null)`,
        [tripId, USER.owner],
      ),
    );
    await expectDenied(() =>
      db.pg.query(
        `insert into trip.trip_share_links (trip_id, created_by, token_hash, short_id, expires_at)
         values ($1, $2, 'abc', 's1', now() + interval '400 days')`,
        [tripId, USER.owner],
      ),
    );
  });

  it("만료를 생략하면 기본 수명이 붙는다", async () => {
    const tripId = await seedTrip(USER.owner);
    const created = await db.pg.query<{ expires_at: Date | null }>(
      `insert into trip.trip_share_links (trip_id, token_hash, short_id)
       values ($1, 'abc', 's1') returning expires_at`,
      [tripId],
    );
    expect(created.rows[0].expires_at).not.toBeNull();
  });

  it("created_by 를 다른 사람으로 위조할 수 없다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.editor, "editor"]]);
    await expectDenied(() =>
      db.pg.query(
        `insert into trip.trip_share_links (trip_id, created_by, token_hash, short_id)
         values ($1, $2, 'abd', 's2')`,
        [tripId, USER.editor],
      ),
    );
  });

  it("폐기한 링크를 되살리거나 만료를 늘릴 수 없다", async () => {
    const tripId = await seedTrip(USER.owner);
    await db.pg.query(
      "insert into trip.trip_share_links (trip_id, token_hash, short_id) values ($1, 'abe', 's3')",
      [tripId],
    );
    await expectDenied(() =>
      db.pg.query("update trip.trip_share_links set expires_at = now() + interval '10 years'"),
    );
    await db.pg.query("update trip.trip_share_links set revoked_at = now()");
    await expectDenied(() => db.pg.query("update trip.trip_share_links set revoked_at = null"));
  });
});

describe("P15 감사 기록 범위", () => {
  it("여행 휴지통·복구와 초대 생성·폐기가 기록된다", async () => {
    const tripId = await seedTrip(USER.owner);
    await createInvite(tripId, "audit");
    await db.pg.query("update trip.trip_invites set revoked_at = now() where trip_id = $1", [tripId]);
    await db.pg.query("update trip.trips set deleted_at = now() where id = $1", [tripId]);
    await db.pg.query("update trip.trips set deleted_at = null where id = $1", [tripId]);

    const events = await db.pg.query<{ action: string; metadata: unknown }>(
      "select action, metadata from trip.audit_events where trip_id = $1 and action not like 'trip_members.%' order by id",
      [tripId],
    );
    expect(events.rows.map((row) => row.action)).toEqual([
      "trips.insert",
      "trip_invites.insert",
      "trip_invites.revoke",
      "trips.trash",
      "trips.restore",
    ]);
    expect(JSON.stringify(events.rows)).not.toContain("audit");
  });
});

describe("P16 작성자 위조", () => {
  it("editor 는 다른 사람을 created_by 로 일정을 넣을 수 없다", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.editor, "editor"]]);
    await db.asUser(USER.editor);
    await expectDenied(() =>
      db.pg.query(
        "insert into trip.itinerary_items (trip_id, type, title, start_at, created_by) values ($1, 'memo', 'x', now(), $2)",
        [tripId, USER.owner],
      ),
    );
    const own = await db.pg.query<{ created_by: string }>(
      "insert into trip.itinerary_items (trip_id, type, title, start_at) values ($1, 'memo', 'x', now()) returning created_by",
      [tripId],
    );
    expect(own.rows[0].created_by).toBe(USER.editor);

    const updated = await db.pg.query<{ created_by: string }>(
      "update trip.itinerary_items set created_by = $1 where trip_id = $2 returning created_by",
      [USER.owner, tripId],
    );
    expect(updated.rows[0].created_by).toBe(USER.editor);
  });

  it("첨부파일 uploaded_by 도 본인만", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.editor, "editor"]]);
    await db.asUser(USER.editor);
    await expectDenied(() =>
      db.pg.query(
        `insert into trip.attachments (trip_id, uploaded_by, storage_path, file_name, mime_type, size_bytes)
         values ($1, $2, $3, 'a.pdf', 'application/pdf', 1)`,
        [tripId, USER.owner, `${tripId}/x/a.pdf`],
      ),
    );
  });
});

describe("프로필 아바타 URL", () => {
  it("https 가 아닌 아바타나 CSS 를 깨는 문자는 저장할 수 없다", async () => {
    await db.asUser(USER.owner);
    for (const bad of [
      "javascript:alert(1)",
      "https://x.test/a.png) , url(https://tracker.test/p",
      "https://x.test/\"onerror",
    ]) {
      await expectDenied(() =>
        db.pg.query("update trip.profiles set avatar_url = $1 where user_id = $2", [bad, USER.owner]),
      );
    }
    const ok = await db.pg.query(
      "update trip.profiles set avatar_url = 'https://lh3.googleusercontent.com/a/abc=s96-c' where user_id = $1 returning user_id",
      [USER.owner],
    );
    expect(ok.rows).toHaveLength(1);
  });

  it("가입 메타데이터의 http 아바타는 https 로, 이상한 값은 비워서 가입을 막지 않는다", async () => {
    await db.asSuperuser();
    const httpUser = "00000000-0000-4000-8000-000000000101";
    const badUser = "00000000-0000-4000-8000-000000000102";
    await db.pg.query(
      `insert into auth.users (id, email, raw_user_meta_data) values
        ($1, 'a@x.test', '{"avatar_url":"http://k.kakaocdn.net/dn/a.jpg"}'),
        ($2, 'b@x.test', '{"avatar_url":"javascript:alert(1)"}')`,
      [httpUser, badUser],
    );
    const rows = await db.pg.query<{ user_id: string; avatar_url: string | null }>(
      "select user_id, avatar_url from trip.profiles where user_id in ($1, $2) order by user_id",
      [httpUser, badUser],
    );
    expect(rows.rows).toEqual([
      { user_id: httpUser, avatar_url: "https://k.kakaocdn.net/dn/a.jpg" },
      { user_id: badUser, avatar_url: null },
    ]);
  });
});

describe("Storage — 쓰지 않는 첨부 버킷", () => {
  it("editor 도 업로드할 수 없다 (첨부 기능이 생길 때 다시 연다)", async () => {
    const tripId = await seedTrip(USER.owner, [[USER.editor, "editor"]]);
    await db.asUser(USER.editor);
    await expectDenied(() =>
      db.pg.query("insert into storage.objects (bucket_id, name) values ('trip-attachments', $1)", [
        `${tripId}/item/a.pdf`,
      ]),
    );
  });

  it("버킷에 크기·형식 제한이 걸려 있다", async () => {
    await db.asSuperuser();
    const bucket = await db.pg.query<{ file_size_limit: string; allowed_mime_types: string[] }>(
      "select file_size_limit, allowed_mime_types from storage.buckets where id = 'trip-attachments'",
    );
    expect(Number(bucket.rows[0].file_size_limit)).toBeGreaterThan(0);
    expect(bucket.rows[0].allowed_mime_types).toContain("application/pdf");
    expect(bucket.rows[0].allowed_mime_types).not.toContain("text/html");
  });
});
