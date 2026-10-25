# ACHANG-AUTH-20261024-P0-001｜Continuation report

Evidence time: 2026-10-25 UTC  
Executor branch: `fix/achang-auth-20261024-p0-001-continuation`  
Initial continuation SHA: `d5635d6b66841e2876e72aba2afc5ae1f42d082f`
Final evidence SHA: recorded in the bundled manifest after commit

## Outcome

Status: **PARTIAL / TEST deployment blocked in this executor**.

The checkout initially pointed at obsolete commit `44cb814aa4d7e1acd189aca3350abd6c7823acf4`.
All remote heads and PR refs were fetched before editing. The continuation is based on the
newest remote source line, `cd61b703c687ad1240e94707929afed60fe157a3`, not the old
checkout or the older PR #2 head. Its merge base with PR #2 head
`7f7a1f66e979e91ab27ee5a38a7415f6c1495ec7` is
`1c0fef126da5719d51ef0e077b1012fd3593f725`.

The branch preserves the October 23 UI line while semantically re-integrating the PR #2
phone/PIN and administrator controls. It does not merge `main` and does not alter
Production data, OAuth, credentials, or paid services.

## Owner claim readback

Source inspection confirms that `cd61b703` changed `api/application.js` from a 16-character
gate to exactly four numeric digits. The parent independently read Vercel deployment metadata
through its connected Vercel account and supplied the following readback evidence:

- alias: `tainan-achang-online.vercel.app`
- deployment: `dpl_AYrXFycxhMwMZAZ9Kh9K4yT7dctY`
- project: `prj_fGn6iRK8V1aGiBS1vikT5xEs5wTC`
- team: `team_Aep4PXnmiXE5276HRkoQrHtF`
- state/target: `READY` / `production`
- source SHA: `cd61b703c687ad1240e94707929afed60fe157a3`

Therefore:

- `CD61_SOURCE_FIX=PASS`
- `CD61_PRODUCTION_ALIAS_SHA=PASS_METADATA_READBACK`
- `CD61_FUNCTIONAL_CLOSED_LOOP=NOT_PROVEN`

`READY` and alias metadata are deployment evidence, not HTTP/E2E functional PASS.

## Changes in this continuation

1. Bounded collision retry for the 10,000-value invitation namespace while retaining the
   database unique hash guard.
2. New `achang_claim_member_invitation` RPC that atomically rechecks code hash, phone,
   expiry, soft-delete state, and account absence before consuming the code.
3. Invitation issued/consumed audit events and a non-reversible claim-first failure policy.
4. Daily phone-scoped application budget retained alongside the IP+phone short window.
5. Six-digit PIN confirmation and clearing for volunteer application and direct provisioning.
6. Phone + PIN login for administrators and volunteers, audited administrator creation,
   new-admin device approval, and last-active-admin protection re-integrated without
   overwriting the October 23 UI or four-digit hardening.
7. Device approve/revoke writes now use conditional status predicates so a late approval
   cannot revive a concurrently revoked device.
8. Sensitive direct provisioning is checked at both the Vercel API and Edge Function; the
   Edge Function independently requires the calling administrator's approved device.
9. The last-administrator guard now counts only administrators who are actually usable under
   the device policy. Administrator audit failure is fail-closed with explicit compensation.

The Auth user create and database account insert cannot share one ACID transaction. The
implementation consumes the exposed invitation first, compensates an account-insert failure
by deleting the new Auth user, reports cleanup failure explicitly, and requires a new invite.
It never restores an exposed invitation.

## Migration and permission delta

New migration: `20261025070000_achang_atomic_invitation_claim.sql`.

- Adds audit subject hash validation/index and invite audit event types.
- Adds an invite-issued trigger.
- Adds `public.achang_claim_member_invitation(text,text,text)` as `SECURITY DEFINER` with
  empty `search_path`.
- Revokes RPC execute from `public`, `anon`, and `authenticated`.
- Grants RPC execute only to `service_role`.
- Adds no RLS policy and grants no client-table write privilege.
- Replaces the existing `app_private.prevent_last_active_admin_change()` body and recreates
  its trigger so an active administrator without an approved device cannot be counted as the
  final recovery administrator.
- Does not change existing account role, status, or `device_approval_required` values.

The already-applied TEST migration is platform version
`20261025035324 achang_phone_pin_admin_controls`. The earlier candidate repository migration
with timestamp `20261025034848` was removed from this continuation so it cannot be reapplied
or bulk-set administrator device exemptions.

Parent connector evidence at approximately 06:30 UTC showed `achang_try_pin_attempt` exists with execute restricted to
`postgres/service_role`; the new claim RPC is not yet present. Its fixed-window limiter is
atomic per bucket, but a boundary can allow a short double burst. This limitation remains
open for a later rolling-window design.

Exact SQL execution scope:

- `app_private.audit_achang_invite_issue()` is `SECURITY DEFINER`, empty `search_path`, and
  runs only from `members_invite_issue_audit` after `application_code_hash` changes.
- `public.achang_claim_member_invitation(...)` is `SECURITY DEFINER`, empty `search_path`,
  executable only by `service_role`; it updates one matching `members` row and inserts one
  `member_authorization_events` row in the same transaction.
- `app_private.prevent_last_active_admin_change()` is `SECURITY DEFINER`, empty
  `search_path`, and runs only before member-account role/status changes.
- No function is granted to `anon` or `authenticated`; no RLS policy is added or relaxed.

## Verification

Commands and actual results:

```text
$ npm test
tests 29; pass 29; fail 0

$ PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser
status PASS
network local synthetic API only; every external request blocked
covered admin/volunteer callback, logout/reopen, second-device request,
visible boot failure, map fallback, four-digit application modal, and five admin pages

$ git diff --check
(no output)

$ esbuild <each Edge function> --bundle --platform=neutral --external:jsr:*
3/3 compiled

$ PostgreSQL 17.6 isolated fixture + three migrations + assertions
MIGRATION_ASSERTIONS_PASS
```

Compiled Edge artifact SHA-256:

- admin provision: `ff27844d2112a7b0c6feef3d61a163fb3f619a4887c9a31e84f207077aa5e16c`
- member apply: `782d5ae8a2e7a83993ebdb45acd5be57b7077932522667bc31763ed6d7a3ea96`
- PIN login: `4f63e12eb91f97cfe58712ab61eeb8b41434fc3bfb33269f853350f8b45daaea`

The final source/migration/evidence SHA-256 values are generated after the final commit and
listed in `MANIFEST.sha256` inside the Library evidence bundle.

These are static/synthetic results, not real backend or physical-device PASS.

Known functional limit: phone login tries at most five candidate accounts and succeeds only
when exactly one PIN matches. It does not yet implement issue #4's masked identity-selection
step for shared-phone members. This continuation does not expand that separate UX/data-flow
requirement inside the four-digit emergency fix; it remains `ISSUE_4_SHARED_PHONE=PARTIAL`.

## Required TEST gate and exact blocker

Target: approved isolated TEST project `fhxdpupascsikjsycpbi`.

Previously verified fixed TEST Vercel identity:

- project: `tjc1/tainan-achang-pin-eipp-test`
- project ID: `prj_QN5VsDGuchs2QiJV6H8ldj3PCtE7`
- fixed alias: `https://tainan-achang-pin-eipp-test.vercel.app/`
- last retained live-test deployment evidence: `dpl_8skTySKKGQKtSLivZ5WqzT4FKRJF`

These retained identifiers must be read back before mutation; they are not evidence that the
alias currently serves the continuation SHA.

Blocked actions: apply the one new narrow migration, deploy the three Edge Functions, deploy
the fixed TEST alias, create identifiable synthetic fixture accounts, and run real Auth/API/RLS
tests for wrong/expired/replayed/concurrent codes, distributed attempts, account approval,
two-device approval/revocation, wrong PIN, role isolation, administrator creation/revocation,
and Google callback wiring.

Reason: this executor has no Supabase/Vercel deployment connector or CLI authentication.
Parent has the connected deployment tools. No existing synthetic TEST login identity was
identified in the handed-off metadata; existence remains **UNKNOWN**, without attempting to
read or create a credential. `GH_TOKEN` is invalid for API reads, although Git push through
the configured repository credential succeeds. The blocked operations were **not attempted**
against TEST or Production and their outcome is known: **not executed**, not denied and not
uncertain.

Minimum additional authority/capability needed: parent uses its scoped deployment path to TEST
project `fhxdpupascsikjsycpbi` to apply only
`20261025070000_achang_atomic_invitation_claim.sql`, deploy only the Edge Functions
`achang-member-apply`, `achang-pin-login`, and `achang-admin-provision`,
Functions, manage only identifiable synthetic TEST rows/Auth users, and deploy/read the fixed
TEST Vercel alias. No secret should be pasted into chat. No Production permission is needed
until the TEST gate passes.

## Production / rollback

No Production deploy occurred from this executor. No new deployment ID exists.

Current Production rollback point read back by parent:

- Production deployment `dpl_AYrXFycxhMwMZAZ9Kh9K4yT7dctY`
- Source SHA `cd61b703c687ad1240e94707929afed60fe157a3`
- Earlier database recovery evidence remains in the retained v1.9/v2.0 reports.

Any later Production promotion must read this alias/deployment again immediately before the
change because deployment state can move.

## Active executor check

Immediately before push, a fresh remote fetch showed no head newer than `cd61b703` and the
local process list showed no Vercel/Supabase deployment process. This does not prove that no
separate cloud executor exists; cloud-side exclusivity remains **UNCERTAIN**.

