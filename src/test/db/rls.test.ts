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

/** owner / editor / viewer 가 붙은 여행을 하나 만든다. */
async function seedTrip(): Promise<string> {
  await db.asUser(USER.owner);
  const inserted = await db.pg.query<{ id: string }>(
    `insert into trip.trips (owner_id, title, start_date, end_date, timezone)
     values ($1, '도쿄 4박5일', '2026-02-14', '2026-02-18', 'Asia/Tokyo')
     returning id`,
    [USER.owner],
  );
  const tripId = inserted.rows[0].id;

  // 멤버는 앱에서 초대 수락(accept_invite)으로만 생긴다. 픽스처는 superuser 로 넣는다.
  await db.addMember(tripId, USER.editor, "editor");
  await db.addMember(tripId, USER.viewer, "viewer");
  await db.asUser(USER.owner);

  return tripId;
}

describe("여행 지출", () => {
  const payload = { title: "점심", category: "식비", spent_on: "2026-02-14", amount_minor: 85000, currency: "TWD", note: "2명" };
  async function save(tripId: string, id: string | null = null, expected: string | null = null, data = payload) {
    return (await db.pg.query<{ id: string }>("select trip.manage_expense($1,'save',$2,$3,$4) id", [tripId,id,expected,JSON.stringify(data)])).rows[0].id;
  }
  it("분류 이름 변경·통합은 편집자에게만 허용하고 변경된 스냅샷 전체를 거부한다", async () => {
    const tripId = await seedTrip();
    const first = await save(tripId), second = await save(tripId);
    await save(tripId, null, null, { ...payload, category: "간식" });
    const snapshot = async () => (await db.pg.query<{ id: string; updated_at: string }>("select id,updated_at from trip.expenses where trip_id=$1 and category='식비' order by id", [tripId])).rows;
    const expected = await snapshot();
    const rename = (rows: unknown = expected, to = "간식", trip = tripId) => db.pg.query("select trip.rename_expense_category($1,'식비',$2,$3)", [trip, to, JSON.stringify(rows)]);
    for (const user of [USER.viewer, USER.stranger]) { await db.asUser(user); await expectDenied(() => rename()); }
    await db.asAnon(); await expectDenied(() => rename());
    await db.asUser(USER.editor);
    await expectDenied(() => rename([expected[0]]));
    await expectDenied(() => rename([expected[0], expected[0]]));
    await expectDenied(() => rename(expected, " "));
    const current = (await db.pg.query<{ updated_at: string }>("select updated_at from trip.expenses where id=$1", [first])).rows[0];
    await save(tripId, first, current.updated_at, { ...payload, title: "동행자가 수정" });
    await expectDenied(() => rename());
    expect((await db.pg.query("select id from trip.expenses where trip_id=$1 and category='식비'", [tripId])).rows).toHaveLength(2);
    const latest = await snapshot();
    await rename(latest);
    const merged = (await db.pg.query<{ category: string; amount_minor: number }>("select category,amount_minor from trip.expenses where trip_id=$1", [tripId])).rows;
    expect(merged).toHaveLength(3);
    expect(merged.every(row => row.category === "간식" && Number(row.amount_minor) === 85000)).toBe(true);
    await expectDenied(() => save(tripId, second, String((expected.find(row => row.id === second) as { updated_at: string }).updated_at)));
  });
  it("분류 변경은 다른 여행의 스냅샷과 삭제된 여행을 거부한다", async () => {
    const tripId = await seedTrip(); await save(tripId);
    const snapshot = (await db.pg.query("select id,updated_at from trip.expenses where trip_id=$1", [tripId])).rows;
    const otherTrip = await seedTrip(); await save(otherTrip);
    await expectDenied(() => db.pg.query("select trip.rename_expense_category($1,'식비','간식',$2)", [otherTrip, JSON.stringify(snapshot)]));
    await db.pg.query("update trip.trips set deleted_at=now() where id=$1", [tripId]);
    await expectDenied(() => db.pg.query("select trip.rename_expense_category($1,'식비','간식',$2)", [tripId, JSON.stringify(snapshot)]));
  });
  it("소유자·편집자는 저장하고 조회자는 읽기만, 비멤버·익명은 접근할 수 없다", async () => {
    const tripId = await seedTrip(); await save(tripId);
    await db.asUser(USER.editor); await save(tripId);
    await db.asUser(USER.viewer);
    expect((await db.pg.query("select * from trip.expenses")).rows).toHaveLength(2);
    await expectDenied(() => save(tripId));
    await db.asUser(USER.stranger);
    expect((await db.pg.query("select * from trip.expenses")).rows).toHaveLength(0);
    await expectDenied(() => save(tripId));
    await db.asAnon(); await expectDenied(() => save(tripId));
    await expectDenied(() => db.pg.query("select * from trip.expenses"));
  });
  it("타 여행 연결·직접 쓰기·오래된 수정·조회자의 삭제를 거부한다", async () => {
    const tripId = await seedTrip(), id = await save(tripId);
    const row = (await db.pg.query<{updated_at:string}>("select updated_at from trip.expenses where id=$1", [id])).rows[0];
    const other = await seedTrip();
    await expectDenied(() => save(other,id,row.updated_at));
    await expectDenied(() => save(tripId,id,"2000-01-01"));
    await expectDenied(() => db.pg.query("update trip.expenses set title='침입' where id=$1",[id]));
    await db.asUser(USER.viewer);
    await expectDenied(() => db.pg.query("select trip.manage_expense($1,'delete',$2,$3,'{}')",[tripId,id,row.updated_at]));
    await db.asUser(USER.editor);
    await save(tripId,id,row.updated_at,{...payload,category:"기념품",amount_minor:999});
    expect((await db.pg.query<{category:string}>("select category from trip.expenses where id=$1",[id])).rows[0].category).toBe("기념품");
    await expectDenied(() => db.pg.query("select trip.manage_expense($1,'delete',$2,$3,'{}')",[tripId,id,row.updated_at]));
    const current = (await db.pg.query<{updated_at:string}>("select updated_at from trip.expenses where id=$1",[id])).rows[0];
    await db.pg.query("select trip.manage_expense($1,'delete',$2,$3,'{}')",[tripId,id,current.updated_at]);
    expect((await db.pg.query("select * from trip.expenses")).rows).toHaveLength(0);
  });
  it("삭제된 여행과 잘못된 금액·분류·통화를 거부한다", async () => {
    const tripId = await seedTrip();
    for (const data of [{...payload,amount_minor:0},{...payload,category:" "},{...payload,currency:"BAD"}]) await expectDenied(() => save(tripId,null,null,data));
    await db.pg.query("update trip.trips set deleted_at=now() where id=$1",[tripId]);
    await expectDenied(() => save(tripId));
  });
});

describe("맛집 보관함", () => {
  const payload = { name: "우육면", originalName: "牛肉麵", region: "가오슝", latitude: 22.62, longitude: 120.28 };
  it("예약 안내를 저장하고 잘못된 상태와 위험한 링크를 거부한다", async () => {
    const tripId = await seedTrip();
    const save = (extra: Record<string, string>) => db.pg.query(`select trip.manage_saved_restaurant($1,'save',null,null,$2::jsonb)`, [tripId, JSON.stringify({...payload, ...extra})]);
    await save({reservationStatus:"available", reservationNote:"전화 예약", reservationUrl:"https://example.com/booking"});
    expect((await db.pg.query("select reservation_status,reservation_note,reservation_url from trip.saved_restaurants where trip_id=$1",[tripId])).rows).toEqual([{reservation_status:"available",reservation_note:"전화 예약",reservation_url:"https://example.com/booking"}]);
    await expectDenied(()=>save({reservationStatus:"booked"}));
    await expectDenied(()=>save({reservationUrl:"javascript:alert(1)"}));
    expect((await db.pg.query("select id from trip.saved_restaurants where trip_id=$1",[tripId])).rows).toHaveLength(1);
  });
  async function createSaved(tripId: string) {
    const result = await db.pg.query<{id:string}>(`select trip.manage_saved_restaurant($1,'save',null,null,$2::jsonb) id`,[tripId,JSON.stringify(payload)]);
    return result.rows[0].id;
  }
  async function readSaved(id: string) {
    return (await db.pg.query<{id:string;updated_at:string;item_id:string}>("select * from trip.saved_restaurants where id=$1",[id])).rows[0];
  }
  it("소유자·편집자 저장, 조회자 조회, 비멤버·익명 접근 거부",async()=>{
    const tripId=await seedTrip(); const id=await createSaved(tripId);
    await db.asUser(USER.editor); await createSaved(tripId);
    await db.asUser(USER.viewer); expect(await readSaved(id)).toBeDefined();
    for(const user of [USER.viewer,USER.stranger]){
      await db.asUser(user); await expectDenied(()=>createSaved(tripId));
      const row=await db.pg.query("select id from trip.saved_restaurants where id=$1",[id]);
      expect(row.rows.length).toBe(user===USER.viewer?1:0);
    }
    await db.asAnon();await expectDenied(()=>readSaved(id));await expectDenied(()=>createSaved(tripId));
  });
  it("직접 수정과 타 여행 연결, 오래된 수정 버전, 기간 밖 예약을 거부한다",async()=>{
    const tripId=await seedTrip(),id=await createSaved(tripId); const row=await readSaved(id);
    await expectDenied(()=>db.pg.query("update trip.saved_restaurants set region='변경' where id=$1",[id]));
    await expectDenied(()=>db.pg.query(`select trip.manage_saved_restaurant($1,'delete',$2,'2000-01-01', '{}')`,[tripId,id]));
    await expectDenied(()=>db.pg.query(`select trip.manage_saved_restaurant($1,'schedule',$2,$3,$4)`,[tripId,id,row.updated_at,JSON.stringify({meal:"점심",startAt:"2026-03-01T03:00:00Z"})]));
    const otherTrip=await seedTrip();
    await expectDenied(()=>db.pg.query(`select trip.manage_saved_restaurant($1,'delete',$2,$3,'{}')`,[otherTrip,id,row.updated_at]));
  });
  it("식사 연결·변경은 한 일정을 유지하고, 연결 해제 후 보관함은 남는다",async()=>{
    const tripId=await seedTrip(),id=await createSaved(tripId);
    let row=await readSaved(id);
    await db.pg.query(`select trip.manage_saved_restaurant($1,'schedule',$2,$3,$4)`,[tripId,id,row.updated_at,JSON.stringify({meal:"점심",startAt:"2026-02-14T03:00:00Z"})]);
    row=await readSaved(id); const firstId=row.item_id;
    let item=(await db.pg.query<{updated_at:string;title:string;start_at:string}>("select * from trip.itinerary_items where id=$1",[firstId])).rows[0];
    expect(item.title).toBe("우육면(牛肉麵) · 점심");
    await expectDenied(()=>db.pg.query(`select trip.manage_saved_restaurant($1,'schedule',$2,$3,$4)`,[tripId,id,row.updated_at,JSON.stringify({meal:"저녁",startAt:"2026-02-15T09:00:00Z",itemUpdatedAt:"2000-01-01"})]));
    await db.pg.query(`select trip.manage_saved_restaurant($1,'schedule',$2,$3,$4)`,[tripId,id,row.updated_at,JSON.stringify({meal:"저녁",startAt:"2026-02-15T09:00:00Z",itemUpdatedAt:item.updated_at})]);
    row=await readSaved(id);expect(row.item_id).toBe(firstId);
    item=(await db.pg.query<typeof item>("select * from trip.itinerary_items where id=$1",[firstId])).rows[0];
    expect(item.title).toBe("우육면(牛肉麵) · 저녁");
    expect(new Date(item.start_at).toISOString()).toBe("2026-02-15T09:00:00.000Z");
    await db.pg.query(`select trip.manage_saved_restaurant($1,'unschedule',$2,$3,$4)`,[tripId,id,row.updated_at,JSON.stringify({itemUpdatedAt:item.updated_at})]);
    row=await readSaved(id);expect(row.item_id).toBeNull();
    const count=await db.pg.query("select id from trip.itinerary_items where id=$1 and deleted_at is null",[firstId]);expect(count.rows).toHaveLength(0);
  });
  it("보관함 삭제는 이미 추가된 일정을 삭제하지 않는다",async()=>{
    const tripId=await seedTrip(),id=await createSaved(tripId);let row=await readSaved(id);
    await db.pg.query(`select trip.manage_saved_restaurant($1,'schedule',$2,$3,$4)`,[tripId,id,row.updated_at,JSON.stringify({meal:"점심",startAt:"2026-02-14T03:00:00Z"})]);
    row=await readSaved(id);
    await db.pg.query(`select trip.manage_saved_restaurant($1,'delete',$2,$3,'{}')`,[tripId,id,row.updated_at]);
    expect(await readSaved(id)).toBeUndefined();
    expect((await db.pg.query("select id from trip.itinerary_items where id=$1",[row.item_id])).rows).toHaveLength(1);
  });
});

describe("여행 소유권", () => {
  it("여행을 만들면 생성자가 owner 멤버로 자동 등록된다", async () => {
    await db.asUser(USER.owner);
    const trip = await db.pg.query<{ id: string }>(
      `insert into trip.trips (owner_id, title, start_date, end_date)
       values ($1, '오사카', '2026-03-01', '2026-03-04') returning id`,
      [USER.owner],
    );

    const members = await db.pg.query<{ user_id: string; role: string }>(
      "select user_id, role from trip.trip_members where trip_id = $1",
      [trip.rows[0].id],
    );

    expect(members.rows).toEqual([{ user_id: USER.owner, role: "owner" }]);
  });

  it("다른 사람을 owner_id 로 지정해 여행을 만들 수 없다", async () => {
    await db.asUser(USER.owner);
    const message = await expectDenied(() =>
      db.pg.query(
        `insert into trip.trips (owner_id, title, start_date, end_date)
         values ($1, '남의 여행', '2026-03-01', '2026-03-04')`,
        [USER.stranger],
      ),
    );
    expect(message).toMatch(/row-level security/i);
  });
});

describe("여행 조회 권한", () => {
  it("멤버는 여행을 조회할 수 있다", async () => {
    const tripId = await seedTrip();

    for (const user of [USER.owner, USER.editor, USER.viewer]) {
      await db.asUser(user);
      const rows = await db.pg.query("select id from trip.trips where id = $1", [tripId]);
      expect(rows.rows).toHaveLength(1);
    }
  });

  it("멤버가 아닌 사용자에게는 여행이 보이지 않는다", async () => {
    const tripId = await seedTrip();

    await db.asUser(USER.stranger);
    const rows = await db.pg.query("select id from trip.trips where id = $1", [tripId]);
    expect(rows.rows).toHaveLength(0);
  });

  it("로그인하지 않은 방문자는 어떤 여행도 읽을 수 없다", async () => {
    await seedTrip();

    await db.asAnon();
    const message = await expectDenied(() => db.pg.query("select id from trip.trips"));
    expect(message).toMatch(/permission denied/i);
  });

  /*
   * 참여자가 스스로 빠져나올 수 있어야 한다. 삭제 정책이 owner 전용이던
   * 동안에는 초대를 잘못 수락해도 owner 에게 부탁하는 것이 유일한 경로였다.
   */
  it("참여자는 스스로 여행에서 나갈 수 있다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.viewer);
    const left = await db.pg.query(
      "delete from trip.trip_members where trip_id = $1 and user_id = $2 returning user_id",
      [tripId, USER.viewer],
    );
    expect(left.rows).toHaveLength(1);
  });

  it("나가기는 자기 행에만 적용된다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.viewer);
    const removed = await db.pg.query(
      "delete from trip.trip_members where trip_id = $1 and user_id = $2 returning user_id",
      [tripId, USER.editor],
    );
    expect(removed.rows).toHaveLength(0);
  });

  /*
   * 여행을 통째로 지울 때는 마지막 소유자 보호가 걸리면 안 된다.
   *
   * cascade 로 지워지는 trip_members 에도 guard_last_owner 가 걸려, 소유자가
   * 자기 여행을 영구 삭제할 방법이 아예 없었다. "30일 보관 후 물리 삭제"
   * 정책도 같은 이유로 막혀 있었다.
   */
  it("소유자는 여행을 물리 삭제할 수 있다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.owner);

    const deleted = await db.pg.query("delete from trip.trips where id = $1 returning id", [
      tripId,
    ]);
    expect(deleted.rows).toHaveLength(1);

    await db.asSuperuser();
    const members = await db.pg.query("select user_id from trip.trip_members where trip_id = $1", [
      tripId,
    ]);
    expect(members.rows).toHaveLength(0);
  });

  it("여행이 남아 있으면 마지막 소유자 보호는 그대로다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.owner);
    await expect(
      db.pg.query("delete from trip.trip_members where trip_id = $1 and user_id = $2", [
        tripId,
        USER.owner,
      ]),
    ).rejects.toThrow(/last owner/i);
  });

  it("마지막 소유자는 스스로도 나갈 수 없다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.owner);
    await expect(
      db.pg.query("delete from trip.trip_members where trip_id = $1 and user_id = $2", [
        tripId,
        USER.owner,
      ]),
    ).rejects.toThrow(/last owner/i);
  });

  it("소유자는 참여자의 역할을 바꿀 수 있고, 참여자는 못 바꾼다", async () => {
    const tripId = await seedTrip();

    await db.asUser(USER.owner);
    const promoted = await db.pg.query<{ role: string }>(
      "update trip.trip_members set role = 'editor' where trip_id = $1 and user_id = $2 returning role",
      [tripId, USER.viewer],
    );
    expect(promoted.rows[0]?.role).toBe("editor");

    await db.asUser(USER.viewer);
    const selfPromotion = await db.pg.query<{ role: string }>(
      "update trip.trip_members set role = 'owner' where trip_id = $1 and user_id = $2 returning role",
      [tripId, USER.viewer],
    );
    expect(selfPromotion.rows).toHaveLength(0);
  });

  it("trip_members 조회가 정책 재귀 없이 동작한다", async () => {
    const tripId = await seedTrip();

    await db.asUser(USER.viewer);
    const rows = await db.pg.query("select user_id from trip.trip_members where trip_id = $1", [
      tripId,
    ]);
    expect(rows.rows).toHaveLength(3);
  });
});

describe("일정 편집 권한", () => {
  async function insertItem(tripId: string) {
    return db.pg.query(
      `insert into trip.itinerary_items (trip_id, created_by, type, title, start_at)
       values ($1, (select auth.uid()), 'food', '이치란라멘', '2026-02-14T05:00:00Z')`,
      [tripId],
    );
  }

  it("editor 는 일정을 추가할 수 있다", async () => {
    const tripId = await seedTrip();

    await db.asUser(USER.editor);
    await insertItem(tripId);

    const rows = await db.pg.query("select id from trip.itinerary_items where trip_id = $1", [
      tripId,
    ]);
    expect(rows.rows).toHaveLength(1);
  });

  it("viewer 는 일정을 추가할 수 없다", async () => {
    const tripId = await seedTrip();

    await db.asUser(USER.viewer);
    const message = await expectDenied(() => insertItem(tripId));
    expect(message).toMatch(/row-level security/i);
  });

  it("viewer 는 일정을 읽을 수는 있다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.editor);
    await insertItem(tripId);

    await db.asUser(USER.viewer);
    const rows = await db.pg.query("select title from trip.itinerary_items where trip_id = $1", [
      tripId,
    ]);
    expect(rows.rows).toHaveLength(1);
  });

  it("viewer 는 일정을 삭제할 수 없다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.editor);
    await insertItem(tripId);

    await db.asUser(USER.viewer);
    const deleted = await db.pg.query("delete from trip.itinerary_items where trip_id = $1", [
      tripId,
    ]);
    // DELETE 는 정책에 걸리면 예외가 아니라 0행으로 끝난다.
    expect(deleted.affectedRows).toBe(0);
  });

  it("멤버가 아닌 사용자는 일정을 추가할 수 없다", async () => {
    const tripId = await seedTrip();

    await db.asUser(USER.stranger);
    const message = await expectDenied(() => insertItem(tripId));
    expect(message).toMatch(/row-level security/i);
  });
});

describe("멤버 관리", () => {
  /*
   * 멤버는 초대 수락(accept_invite)으로만 생긴다. owner 도 동의 없이 남의 계정을
   * 넣을 수 없다 — 넣는 순간 그 사람의 프로필이 보이고 owner 로 만들 수도 있었다.
   */
  it("owner 를 포함해 누구도 멤버를 직접 추가할 수 없다", async () => {
    const tripId = await seedTrip();

    for (const user of [USER.editor, USER.owner]) {
      await db.asUser(user);
      const message = await expectDenied(() =>
        db.pg.query(
          `insert into trip.trip_members (trip_id, user_id, role) values ($1, $2, 'editor')`,
          [tripId, USER.stranger],
        ),
      );
      expect(message).toMatch(/permission denied/i);
    }
  });

  it("마지막 owner 는 강등할 수 없다", async () => {
    const tripId = await seedTrip();

    await db.asUser(USER.owner);
    const message = await expectDenied(() =>
      db.pg.query(
        `update trip.trip_members set role = 'viewer' where trip_id = $1 and user_id = $2`,
        [tripId, USER.owner],
      ),
    );
    expect(message).toMatch(/last owner/i);
  });

  it("마지막 owner 는 삭제할 수 없다", async () => {
    const tripId = await seedTrip();

    await db.asUser(USER.owner);
    const message = await expectDenied(() =>
      db.pg.query(`delete from trip.trip_members where trip_id = $1 and user_id = $2`, [
        tripId,
        USER.owner,
      ]),
    );
    expect(message).toMatch(/last owner/i);
  });

  it("owner 가 둘이면 한 명은 떠날 수 있다", async () => {
    const tripId = await seedTrip();

    await db.addMember(tripId, USER.coOwner, "owner");
    await db.asUser(USER.owner);
    await db.pg.query(`delete from trip.trip_members where trip_id = $1 and user_id = $2`, [
      tripId,
      USER.owner,
    ]);

    await db.asSuperuser();
    const owners = await db.pg.query(
      "select user_id from trip.trip_members where trip_id = $1 and role = 'owner'",
      [tripId],
    );
    expect(owners.rows).toEqual([{ user_id: USER.coOwner }]);
  });
});

describe("공유 링크와 초대", () => {
  async function seedShareLink(tripId: string) {
    await db.asUser(USER.owner);
    await db.pg.query(
      `insert into trip.trip_share_links (trip_id, created_by, token_hash, short_id, expires_at)
       values ($1, $2, 'sha256:deadbeef', 'abc12345', now() + interval '30 days')`,
      [tripId, USER.owner],
    );
  }

  it("owner 만 공유 링크를 조회할 수 있다", async () => {
    const tripId = await seedTrip();
    await seedShareLink(tripId);

    await db.asUser(USER.owner);
    const asOwner = await db.pg.query("select id from trip.trip_share_links");
    expect(asOwner.rows).toHaveLength(1);

    // editor 에게도 token_hash 가 보이면 안 된다.
    await db.asUser(USER.editor);
    const asEditor = await db.pg.query("select id from trip.trip_share_links");
    expect(asEditor.rows).toHaveLength(0);
  });

  it("초대 역할로 owner 를 지정할 수 없다", async () => {
    const tripId = await seedTrip();

    await db.asUser(USER.owner);
    const message = await expectDenied(() =>
      db.pg.query(
        `insert into trip.trip_invites (trip_id, created_by, token_hash, role)
         values ($1, $2, 'sha256:cafe', 'owner')`,
        [tripId, USER.owner],
      ),
    );
    expect(message).toMatch(/trip_invites_role_not_owner/i);
  });
});

describe("감사 기록", () => {
  it("멤버 변경이 자동으로 기록된다", async () => {
    const tripId = await seedTrip();

    await db.asUser(USER.owner);
    // 여행 생성(trips.insert)도 기록되지만 여기서는 멤버 변경만 본다.
    const events = await db.pg.query<{ action: string; target_id: string }>(
      "select action, target_id from trip.audit_events where trip_id = $1 and action like 'trip_members.%' order by id",
      [tripId],
    );

    expect(events.rows.map((row) => row.action)).toEqual([
      "trip_members.insert", // owner (트리거)
      "trip_members.insert", // editor
      "trip_members.insert", // viewer
    ]);
  });

  it("공유 링크 감사 기록에 token_hash 가 들어가지 않는다", async () => {
    const tripId = await seedTrip();
    await db.asSuperuser();
    await db.pg.query(
      `insert into trip.trip_share_links (trip_id, created_by, token_hash, short_id)
       values ($1, $2, 'sha256:supersecret', 'abc12345')`,
      [tripId, USER.owner],
    );

    const events = await db.pg.query<{ metadata: unknown }>(
      "select metadata from trip.audit_events where action like 'trip_share_links%'",
      [],
    );
    expect(events.rows).toHaveLength(1);
    expect(JSON.stringify(events.rows[0].metadata)).not.toContain("supersecret");
  });

  it("사용자는 감사 기록을 직접 만들 수 없다", async () => {
    const tripId = await seedTrip();

    await db.asUser(USER.owner);
    const message = await expectDenied(() =>
      db.pg.query(
        `insert into trip.audit_events (trip_id, actor_id, action) values ($1, $2, 'fake')`,
        [tripId, USER.owner],
      ),
    );
    expect(message).toMatch(/permission denied/i);
  });

  it("owner 가 아닌 멤버는 감사 기록을 볼 수 없다", async () => {
    const tripId = await seedTrip();

    await db.asUser(USER.editor);
    const rows = await db.pg.query("select id from trip.audit_events where trip_id = $1", [
      tripId,
    ]);
    expect(rows.rows).toHaveLength(0);
  });
});

describe("공유 엔티티 (places)", () => {
  /** 장소는 편집 권한을 확인하는 trip.save_place 로만 저장한다. */
  async function savePlace() {
    const tripId = await seedTrip();
    await db.asUser(USER.owner);
    await db.pg.query("select trip.save_place($1, $2::jsonb)", [
      tripId,
      JSON.stringify({
        provider: "kakao",
        provider_place_id: "12345",
        name: "이치란 신주쿠",
        category_group: "food",
        latitude: 35.6938,
        longitude: 139.7034,
      }),
    ]);
  }

  it("여행 편집자는 save_place 로 장소를 만들고, 무관한 사용자는 읽지 못한다", async () => {
    await savePlace();

    await db.asSuperuser();
    expect((await db.pg.query("select name from trip.places")).rows).toHaveLength(1);

    await db.asUser(USER.stranger);
    const rows = await db.pg.query("select name from trip.places");
    expect(rows.rows).toHaveLength(0);
  });

  it("인증 사용자는 공유 장소를 수정할 수 없다", async () => {
    await savePlace();

    await db.asUser(USER.stranger);
    const message = await expectDenied(() =>
      db.pg.query("update trip.places set name = '조작됨'"),
    );
    expect(message).toMatch(/permission denied/i);
  });

  it("서버(service_role)는 장소를 갱신할 수 있다", async () => {
    await savePlace();

    await db.asService();
    const updated = await db.pg.query("update trip.places set name = '이치란 신주쿠점'");
    expect(updated.affectedRows).toBe(1);
  });
});

describe("낙관적 잠금", () => {
  it("updated_at 은 변경 시 자동으로 갱신된다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.editor);

    const before = await db.pg.query<{ updated_at: Date }>(
      "select updated_at from trip.trips where id = $1",
      [tripId],
    );
    await db.pg.query("update trip.trips set title = '도쿄 5박6일' where id = $1", [tripId]);
    const after = await db.pg.query<{ updated_at: Date }>(
      "select updated_at from trip.trips where id = $1",
      [tripId],
    );

    expect(new Date(after.rows[0].updated_at).getTime()).toBeGreaterThan(
      new Date(before.rows[0].updated_at).getTime(),
    );
  });

  it("기대한 updated_at 과 다르면 0행이 갱신된다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.editor);

    const loaded = await db.pg.query<{ updated_at: Date }>(
      "select updated_at from trip.trips where id = $1",
      [tripId],
    );
    const expectedUpdatedAt = loaded.rows[0].updated_at;

    // 다른 사람이 먼저 저장한 상황
    await db.pg.query("update trip.trips set title = '먼저 저장됨' where id = $1", [tripId]);

    const conflicted = await db.pg.query(
      "update trip.trips set title = '나중에 저장됨' where id = $1 and updated_at = $2",
      [tripId, expectedUpdatedAt],
    );
    expect(conflicted.affectedRows).toBe(0);

    const title = await db.pg.query<{ title: string }>(
      "select title from trip.trips where id = $1",
      [tripId],
    );
    expect(title.rows[0].title).toBe("먼저 저장됨");
  });
});

describe("Storage 정책", () => {
  const BUCKET = "trip-attachments";

  /*
   * 첨부 업로드 기능이 아직 없어 쓰기 정책을 닫았다(20261023000001).
   * 기능을 만들 때 서버 경로와 함께 다시 연다. 읽기 정책은 그대로다.
   */
  async function upload(tripId: string, name = "ticket.pdf") {
    return db.pg.query(
      "insert into storage.objects (bucket_id, name, owner) values ($1, $2, (select auth.uid()))",
      [BUCKET, `${tripId}/item/${name}`],
    );
  }

  async function seedObject(tripId: string) {
    await db.asSuperuser();
    await db.pg.query("insert into storage.objects (bucket_id, name) values ($1, $2)", [
      BUCKET,
      `${tripId}/item/ticket.pdf`,
    ]);
  }

  it("editor 도 지금은 업로드할 수 없다", async () => {
    const tripId = await seedTrip();

    await db.asUser(USER.editor);
    const message = await expectDenied(() => upload(tripId));
    expect(message).toMatch(/row-level security/i);
  });

  it("viewer 는 업로드할 수 없다", async () => {
    const tripId = await seedTrip();

    await db.asUser(USER.viewer);
    const message = await expectDenied(() => upload(tripId));
    expect(message).toMatch(/row-level security/i);
  });

  it("멤버가 아닌 사용자는 남의 여행 폴더에 업로드할 수 없다", async () => {
    const tripId = await seedTrip();

    await db.asUser(USER.stranger);
    const message = await expectDenied(() => upload(tripId));
    expect(message).toMatch(/row-level security/i);
  });

  it("멤버가 아닌 사용자에게는 파일이 보이지 않는다", async () => {
    const tripId = await seedTrip();
    await seedObject(tripId);

    await db.asUser(USER.stranger);
    const rows = await db.pg.query("select id from storage.objects");
    expect(rows.rows).toHaveLength(0);

    // viewer 는 읽을 수 있어야 한다.
    await db.asUser(USER.viewer);
    const asViewer = await db.pg.query("select id from storage.objects");
    expect(asViewer.rows).toHaveLength(1);
  });

  it("editor 는 남의 파일을 지우거나 덮어쓸 수 없다", async () => {
    const tripId = await seedTrip();
    await seedObject(tripId);

    await db.asUser(USER.editor);
    const deleted = await db.pg.query("delete from storage.objects returning id");
    expect(deleted.rows).toHaveLength(0);
    const updated = await db.pg.query("update storage.objects set name = name || 'x' returning id");
    expect(updated.rows).toHaveLength(0);
  });
});

describe("첨부파일 경로 제약", () => {
  it("storage_path 는 trip_id 로 시작해야 한다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.editor);

    const message = await expectDenied(() =>
      db.pg.query(
        `insert into trip.attachments (trip_id, uploaded_by, storage_path, file_name, mime_type, size_bytes)
         values ($1, $2, 'somewhere-else/ticket.pdf', 'ticket.pdf', 'application/pdf', 1024)`,
        [tripId, USER.editor],
      ),
    );
    expect(message).toMatch(/attachments_path_scoped_to_trip/i);
  });

  it("trip_id 로 시작하면 저장된다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.editor);

    await db.pg.query(
      `insert into trip.attachments (trip_id, uploaded_by, storage_path, file_name, mime_type, size_bytes)
       values ($1, $2, $3, 'ticket.pdf', 'application/pdf', 1024)`,
      [tripId, USER.editor, `${tripId}/none/ticket.pdf`],
    );

    const rows = await db.pg.query("select id from trip.attachments where trip_id = $1", [tripId]);
    expect(rows.rows).toHaveLength(1);
  });
});

describe("Trip 전용 프로필", () => {
  async function setDisplayName(userId: string, displayName: string) {
    await db.asSuperuser();
    await db.pg.query("update trip.profiles set display_name = $2 where user_id = $1", [
      userId,
      displayName,
    ]);
  }

  it("같은 여행 멤버의 표시 이름을 읽을 수 있다", async () => {
    const tripId = await seedTrip();
    await setDisplayName(USER.editor, "에디터");

    await db.asUser(USER.owner);
    const rows = await db.pg.query<{ user_id: string; display_name: string }>(
      "select user_id, display_name from trip.profiles where user_id = $1",
      [USER.editor],
    );

    expect(rows.rows).toEqual([{ user_id: USER.editor, display_name: "에디터" }]);
    expect(tripId).toBeTruthy();
  });

  it("가입 시 이메일을 기반으로 프로필을 자동 생성한다", async () => {
    await db.asSuperuser();
    const rows = await db.pg.query<{ display_name: string | null }>(
      "select display_name from trip.profiles where user_id = $1",
      [USER.viewer],
    );
    expect(rows.rows).toEqual([{ display_name: USER.viewer }]);
  });

  it("같은 여행에 속하지 않은 사람은 보이지 않는다", async () => {
    await seedTrip();
    await setDisplayName(USER.stranger, "스트레인저");

    await db.asUser(USER.owner);
    const rows = await db.pg.query("select user_id from trip.profiles where user_id = $1", [
      USER.stranger,
    ]);

    expect(rows.rows).toHaveLength(0);
  });

  it("본인 프로필은 여행과 무관하게 보인다", async () => {
    await setDisplayName(USER.owner, "나");

    await db.asUser(USER.owner);
    const rows = await db.pg.query("select user_id from trip.profiles");

    expect(rows.rows).toEqual([{ user_id: USER.owner }]);
  });

  it("로그인하지 않으면 아무것도 읽을 수 없다", async () => {
    await seedTrip();
    await setDisplayName(USER.editor, "김편집");

    await db.asAnon();
    const message = await expectDenied(() =>
      db.pg.query("select user_id from trip.profiles"),
    );
    expect(message).toMatch(/permission denied/i);
  });

  it("표시용 컬럼 외에 민감한 컬럼을 두지 않는다", async () => {
    await db.asSuperuser();
    const columns = await db.pg.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'trip' and table_name = 'profiles'
       order by column_name`,
    );

    expect(columns.rows.map((row) => row.column_name)).toEqual([
      "avatar_url",
      "created_at",
      "display_name",
      "updated_at",
      "user_id",
    ]);
  });

  it("다른 사용자의 프로필은 수정할 수 없다", async () => {
    await seedTrip();
    await db.asUser(USER.owner);
    const updated = await db.pg.query(
      "update trip.profiles set display_name = '변조' where user_id = $1 returning user_id",
      [USER.editor],
    );
    expect(updated.rows).toHaveLength(0);
  });
});

describe("음식점 후보 투표", () => {
  async function seedCandidate(): Promise<{ tripId: string; pollId: string; itemId: string }> {
    const tripId = await seedTrip();
    await db.asSuperuser();
    const poll = await db.pg.query<{ id: string }>(
      `insert into trip.restaurant_polls (trip_id, title, scheduled_at, closes_at, created_by)
       values ($1, '첫째 날 점심 투표', now() + interval '2 days', now() + interval '1 day', $2)
       returning id`,
      [tripId, USER.owner],
    );
    const pollId = poll.rows[0].id;
    await db.asUser(USER.owner);
    const inserted = await db.pg.query<{ id: string }>(
      `insert into trip.itinerary_items
        (trip_id, created_by, type, status, title, start_at, restaurant_poll_id)
       values ($1, $2, 'food', 'candidate', '제주 맛집', now() + interval '2 days', $3)
       returning id`,
      [tripId, USER.owner, pollId],
    );
    return { tripId, pollId, itemId: inserted.rows[0].id };
  }

  /*
   * seedCandidate 는 투표를 superuser 로 넣는다 — RLS 를 타지 않는다.
   * 아래 두 테스트는 앱이 실제로 쓰는 경로, 즉 authenticated 역할로 INSERT 하고
   * 같은 문장에서 id 를 돌려받는 경로를 덮는다.
   *
   * SELECT 정책이 자기 테이블을 id 로 되조회하면(STABLE 헬퍼) 방금 넣은 행이
   * 스냅샷에 없어 `returning` 이 항상 42501 로 거부된다. 실제로 그렇게 깨졌다.
   */
  it("편집 권한이 있는 멤버는 투표를 만들고 같은 문장에서 id 를 돌려받는다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.editor);
    const created = await db.pg.query<{ id: string }>(
      `insert into trip.restaurant_polls (trip_id, title, scheduled_at, closes_at, created_by)
       values ($1, '둘째 날 저녁 투표', now() + interval '2 days', now() + interval '1 day', $2)
       returning id`,
      [tripId, USER.editor],
    );
    expect(created.rows[0].id).toBeTruthy();
  });

  it("viewer 는 투표를 만들 수 없다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.viewer);
    const message = await expectDenied(() =>
      db.pg.query(
        `insert into trip.restaurant_polls (trip_id, title, scheduled_at, closes_at, created_by)
         values ($1, '몰래 만든 투표', now() + interval '2 days', now() + interval '1 day', $2)`,
        [tripId, USER.viewer],
      ),
    );
    expect(message).toMatch(/row-level security/i);
  });

  it("멤버가 아닌 사용자에게는 투표가 보이지 않는다", async () => {
    const { pollId } = await seedCandidate();
    await db.asUser(USER.stranger);
    const rows = await db.pg.query("select id from trip.restaurant_polls where id = $1", [pollId]);
    expect(rows.rows).toHaveLength(0);
  });

  it("투표 생성자는 viewer 역할이어도 자신의 투표와 후보를 삭제할 수 있다", async () => {
    const { pollId, itemId } = await seedCandidate();
    await db.asSuperuser();
    await db.pg.query("update trip.restaurant_polls set created_by = $1 where id = $2", [USER.viewer, pollId]);
    await db.asUser(USER.viewer);
    const result = await db.pg.query<{ delete_own_restaurant_poll: boolean }>(
      "select trip.delete_own_restaurant_poll($1)", [pollId],
    );
    expect(result.rows[0].delete_own_restaurant_poll).toBe(true);
    await db.asSuperuser();
    expect((await db.pg.query("select id from trip.restaurant_polls where id = $1", [pollId])).rows).toHaveLength(0);
    expect((await db.pg.query("select deleted_at from trip.itinerary_items where id = $1 and deleted_at is not null", [itemId])).rows).toHaveLength(1);
  });

  it("투표 생성자가 아닌 사용자는 삭제할 수 없다", async () => {
    const { pollId } = await seedCandidate();
    await db.asUser(USER.viewer);
    const result = await db.pg.query<{ delete_own_restaurant_poll: boolean }>(
      "select trip.delete_own_restaurant_poll($1)", [pollId],
    );
    expect(result.rows[0].delete_own_restaurant_poll).toBe(false);
  });

  it("여행 멤버는 후보에 한 표를 행사하고 취소할 수 있다", async () => {
    const { pollId, itemId } = await seedCandidate();
    await db.asUser(USER.viewer);
    await db.pg.query("insert into trip.restaurant_votes (poll_id, item_id, user_id) values ($1, $2, $3)", [
      pollId,
      itemId,
      USER.viewer,
    ]);
    expect((await db.pg.query("select item_id from trip.restaurant_votes")).rows).toHaveLength(1);
    await db.pg.query("delete from trip.restaurant_votes where item_id = $1", [itemId]);
    expect((await db.pg.query("select item_id from trip.restaurant_votes")).rows).toHaveLength(0);
  });

  it("멤버가 아닌 사용자의 투표는 거부한다", async () => {
    const { pollId, itemId } = await seedCandidate();
    await db.asUser(USER.stranger);
    const message = await expectDenied(() =>
      db.pg.query("insert into trip.restaurant_votes (poll_id, item_id, user_id) values ($1, $2, $3)", [
        pollId,
        itemId,
        USER.stranger,
      ]),
    );
    expect(message).toMatch(/row-level security/i);
  });

  it("다른 사람의 표는 취소할 수 없다", async () => {
    const { pollId, itemId } = await seedCandidate();
    await db.asUser(USER.editor);
    await db.pg.query("insert into trip.restaurant_votes (poll_id, item_id, user_id) values ($1, $2, $3)", [
      pollId,
      itemId,
      USER.editor,
    ]);
    await db.asUser(USER.viewer);
    const deleted = await db.pg.query(
      "delete from trip.restaurant_votes where item_id = $1 and user_id = $2 returning item_id",
      [itemId, USER.editor],
    );
    expect(deleted.rows).toHaveLength(0);
  });

  it("한 사람은 같은 투표에서 한 후보만 선택할 수 있다", async () => {
    const { tripId, pollId, itemId } = await seedCandidate();
    await db.asUser(USER.owner);
    const second = await db.pg.query<{ id: string }>(
      `insert into trip.itinerary_items
        (trip_id, created_by, type, status, title, start_at, restaurant_poll_id)
       values ($1, $2, 'food', 'candidate', '두 번째 식당', now() + interval '2 days', $3)
       returning id`,
      [tripId, USER.owner, pollId],
    );
    await db.asUser(USER.viewer);
    await db.pg.query(
      "insert into trip.restaurant_votes (poll_id, item_id, user_id) values ($1, $2, $3)",
      [pollId, itemId, USER.viewer],
    );
    await expect(
      db.pg.query(
        "insert into trip.restaurant_votes (poll_id, item_id, user_id) values ($1, $2, $3)",
        [pollId, second.rows[0].id, USER.viewer],
      ),
    ).rejects.toThrow(/unique/i);
  });

  it("종료 시 최다 득표 후보를 일정으로 확정하고 나머지를 취소한다", async () => {
    const { tripId, pollId, itemId } = await seedCandidate();
    await db.asUser(USER.owner);
    const second = await db.pg.query<{ id: string }>(
      `insert into trip.itinerary_items
        (trip_id, created_by, type, status, title, start_at, restaurant_poll_id)
       values ($1, $2, 'food', 'candidate', '두 번째 식당', now() + interval '2 days', $3)
       returning id`,
      [tripId, USER.owner, pollId],
    );
    for (const userId of [USER.editor, USER.viewer]) {
      await db.asUser(userId);
      await db.pg.query(
        "insert into trip.restaurant_votes (poll_id, item_id, user_id) values ($1, $2, $3)",
        [pollId, second.rows[0].id, userId],
      );
    }
    await db.asSuperuser();
    await db.pg.query("update trip.restaurant_polls set closes_at = now() - interval '1 minute' where id = $1", [pollId]);
    await db.asUser(USER.owner);
    // 화면은 여행별 마감 함수를 쓴다. 전역 함수는 cron/service_role 전용이다.
    await db.pg.query(
      "select trip.finalize_due_restaurant_polls_for_trip(trip_id) from trip.restaurant_polls where id = $1",
      [pollId],
    );
    const items = await db.pg.query<{ id: string; status: string }>(
      "select id, status::text from trip.itinerary_items where restaurant_poll_id = $1 order by id",
      [pollId],
    );
    expect(items.rows.find((row) => row.id === second.rows[0].id)?.status).toBe("confirmed");
    expect(items.rows.find((row) => row.id === itemId)?.status).toBe("cancelled");
    const poll = await db.pg.query<{ winner_item_id: string; status: string }>(
      "select winner_item_id, status from trip.restaurant_polls where id = $1",
      [pollId],
    );
    expect(poll.rows[0]).toMatchObject({ winner_item_id: second.rows[0].id, status: "finalized" });
  });

  /*
   * 읽기 조건과 쓰기 조건은 다르다.
   *
   * SELECT 정책이 can_vote_for_item() 을 그대로 쓰던 때에는 투표가 확정되는
   * 순간 후보 status 와 poll status 가 함께 바뀌면서 모든 표가 안 보이게 됐다.
   * "투표 종료 · 일정 확정" 인데 1위가 0표로 찍히는 화면이 그 결과였다.
   */
  it("투표가 종료된 뒤에도 멤버는 득표를 볼 수 있다", async () => {
    const { pollId, itemId } = await seedCandidate();
    await db.asUser(USER.viewer);
    await db.pg.query(
      "insert into trip.restaurant_votes (poll_id, item_id, user_id) values ($1, $2, $3)",
      [pollId, itemId, USER.viewer],
    );
    await db.asSuperuser();
    await db.pg.query(
      "update trip.restaurant_polls set closes_at = now() - interval '1 minute' where id = $1",
      [pollId],
    );
    await db.asUser(USER.owner);
    // 화면은 여행별 마감 함수를 쓴다. 전역 함수는 cron/service_role 전용이다.
    await db.pg.query(
      "select trip.finalize_due_restaurant_polls_for_trip(trip_id) from trip.restaurant_polls where id = $1",
      [pollId],
    );

    const votes = await db.pg.query("select item_id from trip.restaurant_votes where poll_id = $1", [
      pollId,
    ]);
    expect(votes.rows).toHaveLength(1);
  });

  it("멤버가 아닌 사용자에게는 종료된 투표의 득표도 보이지 않는다", async () => {
    const { pollId, itemId } = await seedCandidate();
    await db.asUser(USER.viewer);
    await db.pg.query(
      "insert into trip.restaurant_votes (poll_id, item_id, user_id) values ($1, $2, $3)",
      [pollId, itemId, USER.viewer],
    );
    await db.asSuperuser();
    await db.pg.query(
      "update trip.restaurant_polls set closes_at = now() - interval '1 minute' where id = $1",
      [pollId],
    );
    await db.pg.query("select trip.finalize_due_restaurant_polls()");

    await db.asUser(USER.stranger);
    const votes = await db.pg.query("select item_id from trip.restaurant_votes where poll_id = $1", [
      pollId,
    ]);
    expect(votes.rows).toHaveLength(0);
  });

  it("투표가 종료되면 새 표는 더 이상 넣을 수 없다", async () => {
    const { pollId, itemId } = await seedCandidate();
    await db.asSuperuser();
    await db.pg.query(
      "update trip.restaurant_polls set closes_at = now() - interval '1 minute' where id = $1",
      [pollId],
    );
    await db.asUser(USER.viewer);
    const message = await expectDenied(() =>
      db.pg.query(
        "insert into trip.restaurant_votes (poll_id, item_id, user_id) values ($1, $2, $3)",
        [pollId, itemId, USER.viewer],
      ),
    );
    expect(message).toMatch(/row-level security/i);
  });
});

describe("투표 초대", () => {
  it("유효한 초대를 수락하면 viewer 멤버가 된다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.owner);
    await db.pg.query(
      `insert into trip.trip_invites
        (trip_id, created_by, token_hash, role, max_uses, expires_at)
       values ($1, $2, 'test-hash', 'viewer', 1, now() + interval '1 day')`,
      [tripId, USER.owner],
    );

    await db.asUser(USER.stranger);
    const accepted = await db.pg.query<{ accept_invite: string }>(
      "select trip.accept_invite('test-hash')",
    );
    expect(accepted.rows[0].accept_invite).toBe(tripId);

    const membership = await db.pg.query(
      "select role from trip.trip_members where trip_id = $1 and user_id = $2",
      [tripId, USER.stranger],
    );
    expect(membership.rows).toEqual([{ role: "viewer" }]);
  });

  it("만료된 초대는 거부한다", async () => {
    const tripId = await seedTrip();
    await db.asUser(USER.owner);
    await db.pg.query(
      `insert into trip.trip_invites
        (trip_id, created_by, token_hash, role, expires_at)
       values ($1, $2, 'expired-hash', 'viewer', now() - interval '1 day')`,
      [tripId, USER.owner],
    );
    await db.asUser(USER.stranger);
    const message = await expectDenied(() =>
      db.pg.query("select trip.accept_invite('expired-hash')"),
    );
    expect(message).toMatch(/invalid or expired/i);
  });
});


describe("일정 구간별 이동 정보", () => {
  async function seedLeg() {
    const tripId = await seedTrip();
    const result = await db.pg.query<{ id: string }>("insert into trip.itinerary_items(trip_id,type,title,start_at) values ($1,'activity','A','2026-10-05T00:00Z'),($1,'activity','B','2026-10-05T01:00Z') returning id", [tripId]);
    const [from, to] = result.rows.map((r) => r.id);
    return { tripId, from, to };
  }
  const insert = (t: {tripId: string; from: string; to: string}) => db.pg.query("insert into trip.travel_legs(trip_id,from_item_id,to_item_id,mode,minutes,from_location_key,to_location_key) values ($1,$2,$3,'train',90,'A','B')", [t.tripId,t.from,t.to]);
  it("소유자·편집자는 저장하고 조회자는 읽기만 한다", async () => {
    const t = await seedLeg(); await insert(t);
    await db.asUser(USER.editor);
    await db.pg.query("update trip.travel_legs set minutes=120, route_label='2호선' where trip_id=$1", [t.tripId]);
    await db.asUser(USER.viewer);
    expect((await db.pg.query<{minutes:number}>("select minutes from trip.travel_legs")).rows[0].minutes).toBe(120);
    expect((await db.pg.query<{route_label:string}>("select route_label from trip.travel_legs")).rows[0].route_label).toBe("2호선");
    expect((await db.pg.query("update trip.travel_legs set route_label='변경' returning *")).rows).toHaveLength(0);
    expect((await db.pg.query("update trip.travel_legs set minutes=1 returning *")).rows).toHaveLength(0);
    expect((await db.pg.query("delete from trip.travel_legs returning *")).rows).toHaveLength(0);
    await expectDenied(() => insert({ ...t, from:t.to, to:t.from }));
  });
  it("무관한 사용자와 익명에게는 이동정보를 공개하지 않는다", async () => {
    const t = await seedLeg(); await insert(t);
    await db.asUser(USER.stranger);
    expect((await db.pg.query("select * from trip.travel_legs")).rows).toHaveLength(0);
    await expectDenied(() => insert({ ...t, from:t.to, to:t.from }));
    await db.asAnon(); await expectDenied(() => db.pg.query("select * from trip.travel_legs"));
  });
  it("다른 여행 일정 연결과 음수 시간은 DB에서도 거부한다", async () => {
    const t = await seedLeg(); const other = await seedLeg();
    await expectDenied(() => insert({ ...t, to: other.to }));
    await insert(t);
    await expectDenied(() => db.pg.query("update trip.travel_legs set minutes=-1"));
    await db.pg.query("delete from trip.itinerary_items where id=$1", [t.from]);
    expect((await db.pg.query("select * from trip.travel_legs")).rows).toHaveLength(0);
  });
});
