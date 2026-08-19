import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

/**
 * 마이그레이션 적용 도구.
 *
 * Supabase CLI 의 `db push` 는 액세스 토큰과 DB 비밀번호를 요구한다.
 * 이 프로젝트는 헬쑤와 DB 를 공유하므로 헬쑤가 쓰는 접속 정보를 그대로 쓴다.
 *
 * 사용법
 *   node scripts/db.mjs inspect --env-file <path>   현재 상태만 확인 (변경 없음)
 *   node scripts/db.mjs apply   --env-file <path>   마이그레이션 적용
 *
 * 접속 정보는 다음 중 하나로 준다.
 *   - SUPABASE_DB_URL
 *   - SUPA_DB_HOST / SUPA_DB_PORT / SUPA_DB_REF / SUPA_DB_PW
 *
 * --env-file 로 지정한 파일에서 위 값을 읽는다. 지정하지 않으면 process.env 를 쓴다.
 * 비밀번호를 이 저장소에 복사해 두지 않기 위한 구조다.
 */

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, "..", "supabase", "migrations");

function parseArgs(argv) {
  const command = argv[2];
  const out = { command };
  for (let i = 3; i < argv.length; i += 1) {
    if (argv[i] === "--env-file") out.envFile = argv[i + 1];
  }
  return out;
}

function loadEnv(envFile) {
  if (!envFile) return process.env;
  const merged = { ...process.env };
  for (const line of readFileSync(resolve(envFile), "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) merged[match[1]] = match[2].trim();
  }
  return merged;
}

function makeClient(env) {
  if (env.SUPABASE_DB_URL) {
    return new pg.Client({
      connectionString: env.SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 20_000,
    });
  }
  if (env.SUPA_DB_HOST && env.SUPA_DB_PW && env.SUPA_DB_REF) {
    return new pg.Client({
      host: env.SUPA_DB_HOST,
      port: Number(env.SUPA_DB_PORT ?? 5432),
      user: `postgres.${env.SUPA_DB_REF}`,
      password: env.SUPA_DB_PW,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 20_000,
    });
  }
  throw new Error(
    "접속 정보가 없습니다. SUPABASE_DB_URL 또는 SUPA_DB_HOST/PORT/REF/PW 를 주세요.",
  );
}

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

/** 변경 없이 현재 상태만 본다. 공유 DB 라 적용 전에 반드시 거친다. */
async function inspect(client) {
  const q = async (sql, params) => (await client.query(sql, params)).rows;

  console.log("=== 스키마 ===");
  const schemas = await q(
    `select nspname from pg_namespace
     where nspname not like 'pg_%' and nspname <> 'information_schema'
     order by nspname`,
  );
  console.log("  " + schemas.map((r) => r.nspname).join(", "));

  console.log("\n=== public 테이블 수 (헬쑤) ===");
  const publicCount = await q(
    `select count(*)::int as n from pg_tables where schemaname = 'public'`,
  );
  console.log("  " + publicCount[0].n + "개");

  console.log("\n=== public.profiles 컬럼 ===");
  const profileCols = await q(
    `select column_name, data_type from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
     order by column_name`,
  );
  console.log(
    profileCols.length
      ? profileCols.map((r) => `  ${r.column_name} (${r.data_type})`).join("\n")
      : "  (없음)",
  );

  console.log("\n=== trip / trip_private 기존 객체 ===");
  const tripObjects = await q(
    `select table_schema, table_name, table_type from information_schema.tables
     where table_schema in ('trip', 'trip_private') order by table_schema, table_name`,
  );
  console.log(
    tripObjects.length
      ? tripObjects.map((r) => `  ${r.table_schema}.${r.table_name} (${r.table_type})`).join("\n")
      : "  (없음 — 아직 적용 전)",
  );

  console.log("\n=== storage 의 trip_attachments 정책 ===");
  const storagePolicies = await q(
    `select policyname from pg_policies
     where schemaname = 'storage' and policyname like 'trip_attachments%'
     order by policyname`,
  );
  console.log(
    storagePolicies.length
      ? storagePolicies.map((r) => "  " + r.policyname).join("\n")
      : "  (없음)",
  );

  console.log("\n=== PostgREST 노출 스키마 ===");
  const exposed = await q(
    `select setting from pg_settings where name = 'pgrst.db_schemas'
     union all
     select unnest(setconfig) from pg_db_role_setting s
     join pg_roles r on r.oid = s.setrole
     where r.rolname = 'authenticator'`,
  );
  const found = exposed.map((r) => r.setting).filter((v) => v && v.includes("db_schemas"));
  console.log(found.length ? "  " + found.join("\n  ") : "  (역할 설정에서 확인 불가)");

  console.log("\n=== 적용 이력 테이블 ===");
  const history = await q(`select to_regclass('supabase_migrations.schema_migrations') as t`);
  console.log("  " + (history[0].t ?? "(없음)"));

  console.log("\n=== 적용 예정 마이그레이션 ===");
  for (const file of migrationFiles()) console.log("  " + file);
}

async function apply(client) {
  const files = migrationFiles();
  console.log(`마이그레이션 ${files.length}개를 적용합니다.\n`);

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    process.stdout.write(`  ${file} ... `);
    try {
      /*
       * 파일 하나를 트랜잭션으로 감싼다. 중간에 실패하면 그 파일은 통째로
       * 되돌아가므로 반쯤 적용된 상태가 남지 않는다.
       */
      await client.query("begin");
      await client.query(sql);
      await client.query("commit");
      console.log("완료");
    } catch (error) {
      await client.query("rollback").catch(() => {});
      console.log("실패");
      throw new Error(`${file}\n${error.message}`);
    }
  }

  // CLI 이력이 있으면 함께 기록한다. 없으면 건너뛴다.
  const history = await client.query(
    `select to_regclass('supabase_migrations.schema_migrations') as t`,
  );
  if (history.rows[0].t) {
    const versions = files.map((name) => name.split("_")[0]);
    await client.query(
      `insert into supabase_migrations.schema_migrations (version)
       select unnest($1::text[]) on conflict (version) do nothing`,
      [versions],
    );
    console.log("\nCLI 마이그레이션 이력에 기록했습니다.");
  } else {
    console.log("\n이력 테이블이 없어 기록을 건너뜁니다.");
  }
}

/** 적용 결과 확인. */
async function verify(client) {
  const q = async (sql, params) => (await client.query(sql, params)).rows;

  console.log("=== trip 스키마 테이블 ===");
  const tables = await q(
    `select table_name, table_type from information_schema.tables
     where table_schema = 'trip' order by table_name`,
  );
  console.log(tables.map((r) => `  ${r.table_name} (${r.table_type})`).join("\n"));

  console.log("\n=== RLS 적용 여부 ===");
  const rls = await q(
    `select c.relname, c.relrowsecurity, count(p.polname)::int as policies
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     left join pg_policy p on p.polrelid = c.oid
     where n.nspname = 'trip' and c.relkind = 'r'
     group by c.relname, c.relrowsecurity order by c.relname`,
  );
  for (const row of rls) {
    console.log(
      `  ${row.relname.padEnd(18)} RLS=${row.relrowsecurity ? "켜짐" : "!! 꺼짐"} 정책=${row.policies}`,
    );
  }

  console.log("\n=== trip.member_profiles 노출 컬럼 ===");
  const viewCols = await q(
    `select column_name from information_schema.columns
     where table_schema = 'trip' and table_name = 'member_profiles' order by column_name`,
  );
  console.log("  " + viewCols.map((r) => r.column_name).join(", "));

  console.log("\n=== storage 정책 / 버킷 ===");
  const sp = await q(
    `select policyname from pg_policies
     where schemaname = 'storage' and policyname like 'trip_attachments%' order by policyname`,
  );
  console.log("  정책: " + (sp.map((r) => r.policyname).join(", ") || "(없음)"));
  const bucket = await q(
    `select id, public from storage.buckets where id = 'trip-attachments'`,
  );
  console.log(
    "  버킷: " +
      (bucket.length ? `${bucket[0].id} (public=${bucket[0].public})` : "(없음)"),
  );

  console.log("\n=== 헬쑤 public 테이블 권한이 남아 있는지 ===");
  const grants = await q(
    `select count(*)::int as n from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'SELECT'`,
  );
  console.log(`  authenticated 의 public SELECT 권한: ${grants[0].n}개 테이블`);
}

/**
 * PostgREST 노출 스키마에 trip 을 추가한다.
 *
 * 헬쑤와 공유하는 전역 설정이므로 현재 값을 읽어 뒤에 덧붙이기만 한다.
 * 기존 목록을 덮어쓰면 헬쑤의 API 가 통째로 죽는다.
 */
async function expose(client) {
  const { rows } = await client.query(
    `select setconfig from pg_db_role_setting s
     join pg_roles r on r.oid = s.setrole
     where r.rolname = 'authenticator'`,
  );

  const settings = rows[0]?.setconfig ?? [];
  const entry = settings.find((s) => s.startsWith("pgrst.db_schemas="));
  const current = entry ? entry.slice("pgrst.db_schemas=".length) : "public, graphql_public";

  console.log("현재 노출 스키마:", current);

  const list = current.split(",").map((s) => s.trim()).filter(Boolean);
  if (list.includes("trip")) {
    console.log("이미 trip 이 포함돼 있습니다. 변경하지 않습니다.");
    return;
  }
  if (list.includes("trip_private")) {
    throw new Error("trip_private 가 노출돼 있습니다. 수동으로 제거하세요.");
  }

  const next = [...list, "trip"].join(", ");
  console.log("변경 후:", next);

  await client.query(`alter role authenticator set pgrst.db_schemas = $1`, [next]);
  await client.query(`notify pgrst, 'reload config'`);
  await client.query(`notify pgrst, 'reload schema'`);
  console.log("적용하고 PostgREST 에 재읽기를 알렸습니다.");
}

const { command, envFile } = parseArgs(process.argv);
if (!["inspect", "apply", "verify", "expose"].includes(command)) {
  console.error("사용법: node scripts/db.mjs <inspect|apply|verify|expose> [--env-file <path>]");
  process.exit(1);
}

const client = makeClient(loadEnv(envFile));
await client.connect();
try {
  if (command === "inspect") await inspect(client);
  else if (command === "verify") await verify(client);
  else if (command === "expose") await expose(client);
  else await apply(client);
} finally {
  await client.end();
}
