-- LifeSims shared household trial. Each adult manages a private household with their child accounts.
-- Free Render PostgreSQL database expires 2026-12-23; do not retain real children's data.
CREATE TABLE IF NOT EXISTS house_pets(
 owner_id uuid NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
 pet_key text NOT NULL CHECK(pet_key IN ('ginger','black')),
 name text NOT NULL,
 fed_at timestamptz,
 petted_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,pet_key)
);
CREATE TABLE IF NOT EXISTS house_pet_litter(
 owner_id uuid PRIMARY KEY REFERENCES family_accounts(id) ON DELETE CASCADE,
 cleaned_at timestamptz
);
CREATE TABLE IF NOT EXISTS house_events(
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
 recipient_id uuid REFERENCES family_accounts(id) ON DELETE CASCADE,
 event_type text NOT NULL CHECK(event_type IN ('pet','member')),
 subject text NOT NULL,
 action text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 request_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(actor_id,request_id)
);
CREATE INDEX IF NOT EXISTS house_events_house ON house_events(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS house_events_recipient ON house_events(recipient_id,created_at DESC);
CREATE TABLE IF NOT EXISTS house_rules(
 owner_id uuid NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
 action_id text NOT NULL CHECK(action_id ~ '^[a-z][a-z0-9_]{1,36}$'),
 title text NOT NULL,
 target_metric text NOT NULL CHECK(target_metric IN ('nutrition','mood','resource','hygiene','physical')),
 target_gain integer NOT NULL DEFAULT 0 CHECK(target_gain BETWEEN 0 AND 30),
 actor_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
 project text NOT NULL DEFAULT 'Семья',
 PRIMARY KEY(owner_id,action_id)
);
CREATE TABLE IF NOT EXISTS house_chat(
 id uuid PRIMARY KEY,
 sender_id uuid NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
 body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(sender_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS house_chat_pair_time ON house_chat(sender_id,recipient_id,created_at DESC);
CREATE TABLE IF NOT EXISTS house_places(
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
 name text NOT NULL,
 lat double precision NOT NULL CHECK(lat BETWEEN -90 AND 90),
 lon double precision NOT NULL CHECK(lon BETWEEN -180 AND 180),
 radius_m integer NOT NULL CHECK(radius_m BETWEEN 50 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS house_places_owner ON house_places(owner_id);
CREATE TABLE IF NOT EXISTS house_location_settings(
 account_id uuid PRIMARY KEY REFERENCES family_accounts(id) ON DELETE CASCADE,
 guardian_approved boolean NOT NULL DEFAULT false,
 sharing boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS house_positions(
 account_id uuid PRIMARY KEY REFERENCES family_accounts(id) ON DELETE CASCADE,
 lat double precision NOT NULL CHECK(lat BETWEEN -90 AND 90),
 lon double precision NOT NULL CHECK(lon BETWEEN -180 AND 180),
 accuracy_m double precision NOT NULL CHECK(accuracy_m BETWEEN 0 AND 5000),
 received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS house_geo_state(
 account_id uuid NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
 place_id uuid NOT NULL REFERENCES house_places(id) ON DELETE CASCADE,
 inside boolean NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(account_id,place_id)
);
CREATE TABLE IF NOT EXISTS house_geo_events(
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES family_accounts(id) ON DELETE CASCADE,
 place_name text NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('arrived','left')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS house_geo_events_recent ON house_geo_events(owner_id,created_at DESC);
