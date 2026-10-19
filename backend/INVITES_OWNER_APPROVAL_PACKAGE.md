# Invite backend — Owner action-time approval package

Status: DRAFT / NOT APPLIED. Preview UI uses only a fixed `SYNTHETIC-NOT-A-CREDENTIAL` value.

## Proposed data objects

- `public.member_invites`: UUID, SHA-256 `token_hash`, expiry, used/revoked timestamps, creator and audit timestamp. The raw token is returned only once by the future Edge Function and is never persisted.
- `public.membership_applications`: one application per invite, applicant name/phone, `pending → approved|rejected → activated`, review audit fields, optional account link.
- Partial unique index prevents a second pending/approved application for the same normalized phone.

Both tables have RLS enabled and all direct privileges revoked from `PUBLIC`, `anon`, and `authenticated`. Only the Supabase Edge Function's service role may execute the narrowly scoped atomic consume RPC. No service-role secret is added to this repository or Vercel.

## Atomicity and identity checks

- `app_private.consume_member_invite` locks the invite row with `FOR UPDATE`, checks hash shape, expiry, used/revoked state and duplicate phone application, inserts one pending application, and sets `used_at` in the same transaction.
- Admin review must be implemented in `achang-invites` Edge Function. It must validate the caller through Supabase Auth, then verify the matching active `member_accounts.role='admin'`; JWT user metadata alone is forbidden for authorization.
- Approval changes only the application to `approved`. Account provisioning, session creation and device approval remain separate confirmed actions. Activation occurs only after the existing account and device gates succeed.
- Public validate/submit endpoints must be rate limited and return only generic available/unavailable responses to avoid token or roster enumeration.

## Session, revoke and expiry

- Invite expiry does not affect existing sessions because an invite never creates a session.
- Revoking/regenerating marks the old invite revoked and creates a new random token/hash; the old raw link cannot be reactivated.
- Account suspension and device revocation continue through existing `member_accounts` / `member_devices`. Existing secure cookies retain current expiry/logout behavior; no permanent-login promise is introduced.

## Existing data and rollback

- The migration adds two new tables, one index and one private-schema function. It does not alter members, member_accounts, tasks, devices or the already-applied 004 grant.
- Rollback drops the RPC, then applications, then invites. It must only be used after confirming no approved application audit data needs retention.
- Before applying: take a schema backup, record row counts, run security/performance advisors, and verify `PUBLIC`/`anon`/`authenticated` have no table privileges or RPC execute rights.

## Decisions requiring Owner confirmation

1. Token lifetime (proposal: 24 hours) and maximum active invites per admin.
2. Applicant identity evidence and who may approve it; the link itself is not identity proof.
3. Retention/deletion period for rejected and expired applications.
4. Whether approval may provision an Auth account automatically or must remain a second explicit action.
5. Edge Function public-submit rate limit/CAPTCHA policy.
6. Applying `005_invites_owner_approval_required.sql`, deploying `achang-invites`, enabling `INVITES_ENABLED=true`, generating any real token, approving any real application, creating credentials, or granting a device.
