# Windows server deployment

Status: in progress (2026-10-24).

GitHub Actions runs on pushes to main and manual dispatch from main. Tests and Windows builds run on GitHub-hosted runners; deployment uses the dedicated bito-trip runner. Never approve external PR workflows targeting this server.

Server folder: C:/services/Bit-O/trip. Port: 4102. The BitO-App-trip scheduled task runs the application under bito_trip, without administrator privileges. The Actions runner has a separate Windows service. Existing runners are preserved.

Runtime configuration belongs in config/runtime.env on the server, readable only by the project account and administrators. Do not commit or package environment files. Next public build values belong in the BUILD_PUBLIC_ENV repository variable as dotenv text; only NEXT_PUBLIC_* values may be included. Runtime-only secrets never enter the Actions artifact.

A release is checked by SHA and HTTP health before activation. Failed startup restores the previous release. current.json records the active and previous SHAs; logs/runtime.log records application output. Local databases remain under data/. A new accountBook database is initialized from CI-generated demo data only when no database exists.

SSH and application access allow LAN/Tailscale. Application address: http://100.97.115.109:4102. Public HTTPS hostnames, OAuth redirect allowlists and map-provider origin allowlists require separate verification.

Verification pending: first Actions build, deployment health, reboot recovery, external access. 

2026-10-25: Node 24 local verification passed 33 files / 310 tests, ESLint and production build including TypeScript. Runtime settings were copied with user authorization into the restricted server file. The database administration connection string was excluded; no migration or production data change was performed. Only NEXT_PUBLIC_* values are provided to the hosted build. Development port 3100 is unchanged.
