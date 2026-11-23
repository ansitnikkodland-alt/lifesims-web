-- LifeSims family test database, PostgreSQL 18. Owner-only access through API.
CREATE TABLE IF NOT EXISTS family_accounts(
 id uuid PRIMARY KEY,
 email text UNIQUE,
 login text UNIQUE,
 display_name text NOT NULL,
 password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('adult','child')),
 guardian_id uuid REFERENCES family_accounts(id),
 avatar text,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(
   (role='adult' AND email IS NOT NULL AND guardian_id IS NULL)
   OR (role='child' AND login IS NOT NULL AND guardian_id IS NOT NULL)
 )
);
CREATE TABLE IF NOT EXISTS family_sessions(
 token_hash text PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS family_sessions_expiry ON family_sessions(expires_at);
CREATE TABLE IF NOT EXISTS family_saves(
 account_id uuid PRIMARY KEY REFERENCES family_accounts(id) ON DELETE CASCADE,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision > 0),
 payload jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS family_rooms(
 account_id uuid PRIMARY KEY REFERENCES family_accounts(id) ON DELETE CASCADE,
 image_data text,
 markers jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS family_invites(
 secret_hash text PRIMARY KEY,
 from_account uuid NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
 created_by uuid NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('friend','relative','colleague')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 accepted_at timestamptz
);
CREATE TABLE IF NOT EXISTS family_connections(
 id uuid PRIMARY KEY,
 a uuid NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
 b uuid NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('parent','sibling','friend','relative','colleague')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(a <> b)
);
CREATE UNIQUE INDEX IF NOT EXISTS family_unique_connections
 ON family_connections(least(a,b),greatest(a,b),kind);
CREATE INDEX IF NOT EXISTS family_connections_a ON family_connections(a);
CREATE INDEX IF NOT EXISTS family_connections_b ON family_connections(b);
CREATE TABLE IF NOT EXISTS family_care(
 id uuid PRIMARY KEY,
 from_account uuid NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
 to_account uuid NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
 action text NOT NULL CHECK(action IN ('time','help','support','home')),
 request_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(from_account,request_id),
 CHECK(from_account <> to_account)
);
CREATE INDEX IF NOT EXISTS family_care_time ON family_care(created_at DESC);
