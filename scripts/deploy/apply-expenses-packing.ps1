# Apply the expenses and packing migrations to the production database before activating the app that reads them.
# Run on the server. Set PGPASSWORD for the postgres user first; this script never stores it.
$ErrorActionPreference = 'Stop'
if (-not $env:PGPASSWORD) { throw 'Set $env:PGPASSWORD first.' }
$bin = 'D:/bito-db/pgsql/bin'
$dir = Join-Path $PSScriptRoot '../../supabase/migrations'
$files = @('20261118000001_expenses.sql', '20261118000002_expense_categories.sql', '20261118000003_packing_items.sql') | ForEach-Object { Join-Path $dir $_ }
$oldEncoding = $env:PGCLIENTENCODING
try {
  $env:PGCLIENTENCODING = 'UTF8'
  $backup = 'D:/bito-db/backups/trip-before-expenses-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '.dump'
  & "$bin/pg_dump.exe" -h 127.0.0.1 -p 5433 -U postgres -d bito_trip -n trip -Fc -f $backup
  if ($LASTEXITCODE -ne 0) { throw 'Backup failed; no migration applied.' }
  Write-Output "Backup: $backup"
  $args = @('-X', '-h', '127.0.0.1', '-p', '5433', '-U', 'postgres', '-d', 'bito_trip', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-c', "set local lock_timeout='5s'; set local statement_timeout='30s';")
  foreach ($file in $files) { $args += @('-f', $file) }
  & "$bin/psql.exe" @args
  if ($LASTEXITCODE -ne 0) { throw 'Migration failed and was rolled back; app activation stopped.' }
  Write-Output 'Expenses and packing migrations applied.'
} finally {
  $env:PGCLIENTENCODING = $oldEncoding
}
