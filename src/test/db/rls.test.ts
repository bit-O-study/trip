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
  it("owner 만 멤버를 추가할 수 있다", async () => {
    const tripId = await seedTrip();

    await db.asUser(USER.editor);
    const message = await expectDenied(() =>
      db.pg.query(
        `insert into trip.trip_members (trip_id, user_id, role) values ($1, $2, 'editor')`,
        [tripId, USER.stranger],
      ),
    );
    expect(message).toMatch(/row-level security/i);
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

    await db.asUser(USER.owner);
    await db.pg.query(
      `insert into trip.trip_members (trip_id, user_id, role) values ($1, $2, 'owner')`,
      [tripId, USER.coOwner],
    );
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
      `insert into trip.trip_share_links (trip_id, created_by, token_hash, short_id)
       values ($1, $2, 'sha256:deadbeef', 'abc12345')`,
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
    const events = await db.pg.query<{ action: string; target_id: string }>(
      "select action, target_id from trip.audit_events where trip_id = $1 order by id",
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
    await db.asUser(USER.owner);
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
  it("인증 사용자는 장소를 읽고 만들 수 있다", async () => {
    await db.asUser(USER.owner);
    await db.pg.query(
      `insert into trip.places (provider, provider_place_id, name, category_group, latitude, longitude)
       values ('kakao', '12345', '이치란 신주쿠', 'food', 35.6938, 139.7034)`,
    );

    await db.asUser(USER.stranger);
    const rows = await db.pg.query("select name from trip.places");
    expect(rows.rows).toHaveLength(1);
  });

  it("인증 사용자는 공유 장소를 수정할 수 없다", async () => {
    await db.asUser(USER.owner);
    await db.pg.query(
      `insert into trip.places (provider, provider_place_id, name, category_group, latitude, longitude)
       values ('kakao', '12345', '이치란 신주쿠', 'food', 35.6938, 139.7034)`,
    );

    await db.asUser(USER.stranger);
    const message = await expectDenied(() =>
      db.pg.query("update trip.places set name = '조작됨'"),
    );
    expect(message).toMatch(/permission denied/i);
  });

  it("서버(service_role)는 장소를 갱신할 수 있다", async () => {
    await db.asUser(USER.owner);
    await db.pg.query(
      `insert into trip.places (provider, provider_place_id, name, category_group, latitude, longitude)
       values ('kakao', '12345', '이치란 신주쿠', 'food', 35.6938, 139.7034)`,
    );

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

  async function upload(tripId: string, name = "ticket.pdf") {
    return db.pg.query(
      "insert into storage.objects (bucket_id, name, owner) values ($1, $2, (select auth.uid()))",
      [BUCKET, `${tripId}/item/${name}`],
    );
  }

  it("editor 는 자기 여행 폴더에 업로드할 수 있다", async () => {
    const tripId = await seedTrip();

    await db.asUser(USER.editor);
    await upload(tripId);

    const rows = await db.pg.query("select id from storage.objects");
    expect(rows.rows).toHaveLength(1);
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
    await db.asUser(USER.editor);
    await upload(tripId);

    await db.asUser(USER.stranger);
    const rows = await db.pg.query("select id from storage.objects");
    expect(rows.rows).toHaveLength(0);

    // viewer 는 읽을 수 있어야 한다.
    await db.asUser(USER.viewer);
    const asViewer = await db.pg.query("select id from storage.objects");
    expect(asViewer.rows).toHaveLength(1);
  });

  it("trip_id 로 시작하지 않는 경로는 업로드할 수 없다", async () => {
    await seedTrip();

    await db.asUser(USER.editor);
    const message = await expectDenied(() =>
      db.pg.query("insert into storage.objects (bucket_id, name) values ($1, $2)", [
        BUCKET,
        "anything/ticket.pdf",
      ]),
    );
    // 경로에서 uuid 를 못 뽑으면 null 이 되고, null 은 어떤 멤버십도 통과하지 못한다.
    expect(message).toMatch(/row-level security/i);
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

describe("동행자 표시 이름 (헬쑤 profiles 공유)", () => {
  async function seedProfile(
    userId: string,
    fields: { name?: string | null; nickname?: string | null; phone?: string | null },
  ) {
    // 헬쑤 앱이 만들어 둔 행을 흉내 낸다. Trip 은 이 테이블에 쓰지 않는다.
    await db.asSuperuser();
    await db.pg.query(
      `insert into public.profiles (user_id, gender, experience, name, nickname, phone, weight_kg)
       values ($1, 'male', 'beginner', $2, $3, $4, 78.5)`,
      [userId, fields.name ?? null, fields.nickname ?? null, fields.phone ?? null],
    );
  }

  it("같은 여행 멤버의 표시 이름을 읽을 수 있다", async () => {
    const tripId = await seedTrip();
    await seedProfile(USER.editor, { name: "김편집", nickname: "에디터" });

    await db.asUser(USER.owner);
    const rows = await db.pg.query<{ user_id: string; display_name: string }>(
      "select user_id, display_name from trip.member_profiles where user_id = $1",
      [USER.editor],
    );

    expect(rows.rows).toEqual([{ user_id: USER.editor, display_name: "에디터" }]);
    expect(tripId).toBeTruthy();
  });

  it("닉네임이 없으면 이름으로 폴백한다", async () => {
    await seedTrip();
    await seedProfile(USER.viewer, { name: "박뷰어", nickname: "   " });

    await db.asUser(USER.owner);
    const rows = await db.pg.query<{ display_name: string | null }>(
      "select display_name from trip.member_profiles where user_id = $1",
      [USER.viewer],
    );

    expect(rows.rows[0].display_name).toBe("박뷰어");
  });

  it("같은 여행에 속하지 않은 사람은 보이지 않는다", async () => {
    await seedTrip();
    await seedProfile(USER.stranger, { name: "남남", nickname: "스트레인저" });

    await db.asUser(USER.owner);
    const rows = await db.pg.query("select user_id from trip.member_profiles where user_id = $1", [
      USER.stranger,
    ]);

    expect(rows.rows).toHaveLength(0);
  });

  it("본인 프로필은 여행과 무관하게 보인다", async () => {
    await seedProfile(USER.owner, { name: "나", nickname: null });

    await db.asUser(USER.owner);
    const rows = await db.pg.query("select user_id from trip.member_profiles");

    expect(rows.rows).toEqual([{ user_id: USER.owner }]);
  });

  it("로그인하지 않으면 아무것도 읽을 수 없다", async () => {
    await seedTrip();
    await seedProfile(USER.editor, { name: "김편집", nickname: null });

    await db.asAnon();
    const message = await expectDenied(() =>
      db.pg.query("select user_id from trip.member_profiles"),
    );
    expect(message).toMatch(/permission denied/i);
  });

  it("민감한 컬럼을 노출하지 않는다", async () => {
    // 이것이 이 뷰의 존재 이유다. public.profiles 에 정책을 추가하는 방식이었다면
    // RLS 는 행 단위라 전화번호·체중·정지사유까지 전부 함께 열렸을 것이다.
    await db.asSuperuser();
    const columns = await db.pg.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'trip' and table_name = 'member_profiles'
       order by column_name`,
    );

    expect(columns.rows.map((row) => row.column_name)).toEqual([
      "display_name",
      "user_id",
    ]);
  });

  it("헬쑤 원본 테이블의 정책은 그대로다", async () => {
    // Trip 은 public.profiles 에 정책·권한을 추가하지 않았다.
    // 동행자여도 원본 테이블로는 여전히 본인 행만 보여야 한다.
    await seedTrip();
    await seedProfile(USER.owner, { name: "나", nickname: null });
    await seedProfile(USER.editor, { name: "김편집", nickname: null, phone: "010-0000-0000" });

    await db.asUser(USER.owner);
    const rows = await db.pg.query<{ user_id: string }>(
      "select user_id from public.profiles",
    );

    expect(rows.rows).toEqual([{ user_id: USER.owner }]);
  });
});
