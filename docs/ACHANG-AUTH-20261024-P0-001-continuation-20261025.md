# ACHANG-AUTH-20261024-P0-001｜Continuation report

Evidence time: 2026-10-25 UTC  
Executor branch: `fix/achang-auth-20261024-p0-001-continuation`  
Continuation SHA: `d5635d6b66841e2876e72aba2afc5ae1f42d082f`  
Tree: `816773e151e53d970ceac8cce99aea9cb4a0b1fa`

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
gate to exactly four numeric digits. GitHub shows only a successful `Vercel Preview Comments`
check for that commit; it does not prove that the fixed Production alias currently serves that
SHA. Direct reads of the Vercel alias were denied by the executor network proxy. Therefore:

- `CD61_SOURCE_FIX=PASS`
- `CD61_PRODUCTION_ALIAS_SHA=UNCERTAIN`
- `CD61_FUNCTIONAL_CLOSED_LOOP=NOT_PROVEN`

The most recent retained Production evidence before `cd61b703` records deployment
`dpl_DNhLKr3MhJe2hUjsBamu29mZ2Gn9` at source SHA
`925503f2fb01325be438cce3a57647bf5b932d91`. This is evidence, not a claim about the
current alias.

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

TEST catalog readback showed `achang_try_pin_attempt` exists with execute restricted to
`postgres/service_role`; the new claim RPC is not yet present. Its fixed-window limiter is
atomic per bucket, but a boundary can allow a short double burst. This limitation remains
open for a later rolling-window design.

## Verification

Commands and actual results:

```text
$ npm test
tests 28; pass 28; fail 0

$ PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser
status PASS
network local synthetic API only; every external request blocked
covered admin/volunteer callback, logout/reopen, second-device request,
visible boot failure, map fallback, four-digit application modal, and five admin pages

$ git diff --check
(no output)

$ esbuild <each Edge function> --bundle --platform=neutral --external:jsr:*
3/3 compiled
```

Compiled Edge artifact SHA-256:

- admin provision: `02e50f48ab4211f8cb0b1b2531988d35d3434b0d6fe9c3e583b642186d574623`
- member apply: `782d5ae8a2e7a83993ebdb45acd5be57b7077932522667bc31763ed6d7a3ea96`
- PIN login: `4f63e12eb91f97cfe58712ab61eeb8b41434fc3bfb33269f853350f8b45daaea`

Migration SHA-256:

- phone/admin controls: `7ca62a86073f84c1feba38ed82ca1a044225fb7feefb4983ea3da2159dbe4ef7`
- atomic invitation claim: `34de24c5c9584c1fae4b2304addbe6d1c81291d8576b00582a97d3c567329615`

These are static/synthetic results, not real backend or physical-device PASS.

## Required TEST gate and exact blocker

Target: approved isolated TEST project `fhxdpupascsikjsycpbi`.

Blocked actions: apply the two reviewed migrations, deploy the three Edge Functions, deploy
the fixed TEST alias, create identifiable synthetic fixture accounts, and run real Auth/API/RLS
tests for wrong/expired/replayed/concurrent codes, distributed attempts, account approval,
two-device approval/revocation, wrong PIN, role isolation, administrator creation/revocation,
and Google callback wiring.

Reason: this executor has no Supabase/Vercel deployment connector, CLI authentication, or
existing TEST login credential. `GH_TOKEN` is invalid for API reads, although Git push through
the configured repository credential succeeds. The blocked operations were **not attempted**
against TEST or Production and their outcome is known: **not executed**, not denied and not
uncertain.

Minimum additional authority/capability needed: a scoped deployment path to TEST project
`fhxdpupascsikjsycpbi` that can apply the named migrations, deploy only the three named Edge
Functions, manage only identifiable synthetic TEST rows/Auth users, and deploy/read the fixed
TEST Vercel alias. No secret should be pasted into chat. No Production permission is needed
until the TEST gate passes.

## Production / rollback

No Production deploy occurred from this executor. No new deployment ID exists.

Known prior rollback evidence:

- Production deployment `dpl_DNhLKr3MhJe2hUjsBamu29mZ2Gn9`
- Source SHA `925503f2fb01325be438cce3a57647bf5b932d91`
- Earlier database recovery evidence remains in the retained v1.9/v2.0 reports.

Any later Production promotion must record the pre-promotion alias/deployment again because
the current alias-to-SHA mapping could not be independently read here.

## Active executor check

Immediately before push, a fresh remote fetch showed no head newer than `cd61b703` and the
local process list showed no Vercel/Supabase deployment process. This does not prove that no
separate cloud executor exists; cloud-side exclusivity remains **UNCERTAIN**.

