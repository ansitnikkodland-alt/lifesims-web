# LifeSims family API test deployment

This branch tracks the LifeSims v121 household backend for the already-approved
Render free test service `lifesims-family-test-api`.

This deployment uses only the pre-existing Render Postgres test database and
does not provision any paid services.

The test database expires 2026-12-23. Do not store real children’s medical
information or private location histories as durable data.

Location is off by default. Guardian approval and each child’s own explicit
browser activation are required. Browser location is foreground-only.

Deployment marker: family v121, 2026-11-23.
