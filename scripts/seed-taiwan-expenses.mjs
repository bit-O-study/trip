import { readFileSync } from "node:fs";
import pg from "pg";

/**
 * 대만 4박 5일(2026-11-19~23) 사전 결제 지출을 한 번에 넣는다. 금액은 모두 원화(KRW)다.
 *
 * 사용법 (기본은 미리보기이며 DB를 바꾸지 않는다)
 *   node scripts/seed-taiwan-expenses.mjs <tripId> [--env-file <path>]
 *   node scripts/seed-taiwan-expenses.mjs <tripId> --apply [--env-file <path>]
 *
 * - `trip.expenses` 테이블(마이그레이션 20261118000001)이 있는 DB에서만 동작한다.
 * - 같은 여행에 제목·날짜·금액이 같은 지출이 있으면 건너뛰므로 다시 실행해도 중복되지 않는다.
 * - 결제일을 모르는 항목은 예약 선결제로 보고 2026-11-18로 넣었다. 앱의 지출 수정 화면에서 바꾼다.
 */
const ROWS = [
  { title: "가오슝 안 호텔 2박", category: "숙박", spent_on: "2026-11-19", amount: 284733, note: "11/19~11/21 · 2박" },
  { title: "가오슝 난 난 1박", category: "숙박", spent_on: "2026-11-21", amount: 323102, note: "11/21~11/22 · 1박" },
  { title: "타이베이 화산딘 1박", category: "숙박", spent_on: "2026-11-22", amount: 207895, note: "11/22~11/23 · 1박 (입력 원문: 22~22)" },
  { title: "환전", category: "기타", spent_on: "2026-11-18", amount: 500000, note: "현금 환전. 이후 현지 지출과 이중 집계될 수 있어요" },
  { title: "타이베이 스지 투어", category: "관광", spent_on: "2026-11-18", amount: 69500, note: "예약 선결제" },
  { title: "가오슝 타이난 투어", category: "관광", spent_on: "2026-11-18", amount: 62600, note: "예약 선결제" },
  { title: "기차", category: "교통", spent_on: "2026-11-18", amount: 152400, note: "예약 선결제" },
  { title: "eSIM", category: "기타", spent_on: "2026-11-18", amount: 16890, note: "예약 선결제" },
];

const args = process.argv.slice(2);
const tripId = args.find(a => /^[0-9a-f-]{36}$/i.test(a));
const apply = args.includes("--apply");
const envFile = args.includes("--env-file") ? args[args.indexOf("--env-file") + 1] : ".env.local";
if (!tripId) { console.error("여행 ID(UUID)를 첫 인자로 주세요. 예: node scripts/seed-taiwan-expenses.mjs <tripId>"); process.exit(1); }

const url = process.env.SUPABASE_DB_URL ?? readFileSync(envFile, "utf8").match(/^SUPABASE_DB_URL=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, "");
if (!url) { console.error("SUPABASE_DB_URL 이 없습니다."); process.exit(1); }
const local = /127\.0\.0\.1|localhost/.test(url);
const client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
await client.connect();
try {
  const table = (await client.query("select to_regclass('trip.expenses') t")).rows[0].t;
  if (!table) throw new Error("trip.expenses 테이블이 없습니다. 지출 마이그레이션을 먼저 적용하세요 (npm run db:apply).");
  const trip = (await client.query("select title,start_date,end_date from trip.trips where id=$1 and deleted_at is null", [tripId])).rows[0];
  if (!trip) throw new Error("해당 여행을 찾을 수 없습니다.");
  console.log(`여행: ${trip.title}  ${apply ? "[적용]" : "[미리보기]"}`);
  let added = 0, total = 0;
  await client.query("begin");
  for (const row of ROWS) {
    const exists = (await client.query("select 1 from trip.expenses where trip_id=$1 and title=$2 and spent_on=$3 and amount_minor=$4", [tripId, row.title, row.spent_on, row.amount])).rowCount;
    console.log(`${exists ? "건너뜀" : "추가  "}  ${row.spent_on}  ${row.category}  ${row.title}  ${row.amount.toLocaleString()} KRW`);
    if (exists) continue;
    await client.query("insert into trip.expenses(trip_id,title,category,spent_on,amount_minor,currency,note) values($1,$2,$3,$4,$5,'KRW',$6)", [tripId, row.title, row.category, row.spent_on, row.amount, row.note]);
    added += 1; total += row.amount;
  }
  await client.query(apply ? "commit" : "rollback");
  console.log(`${apply ? "저장" : "미리보기(저장 안 함)"}: ${added}건, ${total.toLocaleString()} KRW`);
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(error.message); process.exitCode = 1;
} finally { await client.end(); }
