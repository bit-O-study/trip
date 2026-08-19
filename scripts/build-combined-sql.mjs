import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 마이그레이션을 하나의 SQL 파일로 합친다.
 *
 * Supabase 대시보드의 SQL 에디터에 붙여넣어 실행하기 위한 것이다.
 * DB 비밀번호나 액세스 토큰 없이 스키마를 적용할 수 있다.
 *
 * 원본은 언제나 supabase/migrations/ 다. 이 파일은 매번 다시 생성하며
 * 커밋하지 않는다(.gitignore).
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const OUTPUT = join(process.cwd(), "supabase", ".combined.sql");

const files = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error(`마이그레이션이 없습니다: ${MIGRATIONS_DIR}`);
  process.exit(1);
}

const banner = `-- ---------------------------------------------------------------------------
-- Trip Planner 스키마 (자동 생성 — 직접 고치지 마세요)
--
-- 원본: supabase/migrations/*.sql
-- 재생성: npm run db:sql
--
-- 사용법
--   1. 이 파일 전체를 Supabase 대시보드 SQL Editor 에 붙여넣고 실행합니다.
--   2. 실행 후 Settings -> API -> Exposed schemas 에 "trip" 을 추가합니다.
--      ("trip_private" 는 추가하지 마세요 — 내부 헬퍼가 RPC 로 열립니다.)
--
-- 주의: 이 데이터베이스는 헬쑤와 공유합니다. 아래 문장은 trip / trip_private
-- 스키마와 storage 정책만 다루며 public 스키마의 기존 테이블은 건드리지 않습니다.
-- ---------------------------------------------------------------------------

`;

const parts = [banner];

for (const file of files) {
  const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8").trimEnd();
  parts.push(
    `-- ===========================================================================\n` +
      `-- ${file}\n` +
      `-- ===========================================================================\n\n` +
      `${sql}\n\n`,
  );
}

/*
 * CLI 의 마이그레이션 이력에 같은 버전을 기록해 둔다.
 * 이걸 빼면 나중에 `supabase db push` 가 이미 적용된 마이그레이션을 다시
 * 실행하려 해서 실패한다.
 *
 * 이력 테이블이 아직 없는 프로젝트(= CLI 를 한 번도 쓴 적 없음)에서는
 * 조용히 건너뛴다. 그 경우 나중에 `supabase migration repair --status applied <version>`
 * 으로 맞추면 된다.
 */
const versions = files.map((name) => name.split("_")[0]);
parts.push(
  `-- ===========================================================================\n` +
    `-- CLI 마이그레이션 이력 기록\n` +
    `-- ===========================================================================\n\n` +
    `do $$\n` +
    `begin\n` +
    `  if to_regclass('supabase_migrations.schema_migrations') is not null then\n` +
    `    insert into supabase_migrations.schema_migrations (version)\n` +
    `    values ${versions.map((v) => `('${v}')`).join(", ")}\n` +
    `    on conflict (version) do nothing;\n` +
    `  else\n` +
    `    raise notice '마이그레이션 이력 테이블이 없어 기록을 건너뜁니다. 나중에 supabase migration repair 로 맞추세요.';\n` +
    `  end if;\n` +
    `end $$;\n`,
);

writeFileSync(OUTPUT, parts.join(""), "utf8");

console.log(`생성됨: ${OUTPUT}`);
console.log(`포함된 마이그레이션 ${files.length}개:`);
for (const file of files) console.log(`  - ${file}`);
