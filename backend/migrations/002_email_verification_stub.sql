-- ============================================================================
-- Email verification columns, stubbed for now: the code is written here, not
-- emailed. backend/auth.js console.logs it as a dev-only stand-in for a real
-- email provider (Resend/SendGrid/etc.), which is a separate, later piece of
-- work — swapping it in only touches that one console.log call.
-- ============================================================================
alter table users
  add column if not exists email_verified              boolean not null default false,
  add column if not exists verification_code           varchar,
  add column if not exists verification_code_expires_at timestamptz,
  add column if not exists verification_attempts       integer not null default 0;
