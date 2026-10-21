CREATE TABLE app.external_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('microsoft')),
  provider_tenant text NOT NULL CHECK (length(btrim(provider_tenant)) BETWEEN 1 AND 200),
  provider_subject text NOT NULL CHECK (length(btrim(provider_subject)) BETWEEN 1 AND 500),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  email citext NOT NULL,
  claims jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(claims) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_tenant, provider_subject),
  UNIQUE (provider, user_id)
);

CREATE TABLE app.microsoft_auth_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash char(64) NOT NULL UNIQUE CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  nonce text NOT NULL CHECK (length(nonce) BETWEEN 32 AND 256),
  code_verifier text NOT NULL CHECK (length(code_verifier) BETWEEN 43 AND 128),
  return_path text NOT NULL DEFAULT '/' CHECK (return_path LIKE '/%' AND return_path NOT LIKE '//%'),
  request_ip inet,
  request_user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX microsoft_auth_requests_active_idx
  ON app.microsoft_auth_requests(expires_at)
  WHERE consumed_at IS NULL;

CREATE INDEX external_identities_user_idx ON app.external_identities(user_id);
