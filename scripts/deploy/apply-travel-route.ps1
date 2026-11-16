# Add the optional route label before activating the app that reads it.
$ErrorActionPreference = 'Stop'
$bin = 'D:/bito-db/pgsql/bin'
$migration = Join-Path $PSScriptRoot '../../supabase/migrations/20261116000003_travel_route_label.sql'
$oldPassword = $env:PGPASSWORD
$oldEncoding = $env:PGCLIENTENCODING
try {
  $env:PGPASSWORD = [IO.File]::ReadAllText('D:/bito-db/secrets/pg-superuser.txt').Trim()
  $env:PGCLIENTENCODING = 'UTF8'
  $backup = 'D:/bito-db/backups/trip-travel-legs-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '.dump'
  & "$bin/pg_dump.exe" -h 127.0.0.1 -p 5433 -U postgres -d bito_trip -t trip.travel_legs -Fc -f $backup
  if ($LASTEXITCODE -ne 0) { throw 'Travel backup failed; no migration applied.' }
  & "$bin/psql.exe" -X -h 127.0.0.1 -p 5433 -U postgres -d bito_trip -v ON_ERROR_STOP=1 --single-transaction -c "set local lock_timeout='5s'; set local statement_timeout='30s';" -f $migration
  if ($LASTEXITCODE -ne 0) { throw 'Travel route migration failed; app activation stopped.' }
  Write-Output 'Travel route migration applied.'
} finally {
  $env:PGPASSWORD = $oldPassword
  $env:PGCLIENTENCODING = $oldEncoding
}
