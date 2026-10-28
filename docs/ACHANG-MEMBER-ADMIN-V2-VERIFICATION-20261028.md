# ACHANG member authorization API v2 — verification record

Date: 2026-10-28 UTC

Scope: isolated development only; no Production deployment or Production data mutation

Branch: `feature/achang-member-admin-v2-20261028`

Base UI commit: `082d790b06b87a1927865be4466423675ce31c0e`

## Verified preflight

- TEST Supabase project: `fhxdpupascsikjsycpbi`.
- Production Supabase project: `ctskglmglevronvnkpmm` (read-only inspection only).
- Existing `achang-admin-provision`: TEST v7; Production v8; identical inspected source hash. It remains unchanged for rollback.
- Existing `achang-pin-login`: TEST v10; Production v8. Its inspected source verifies six-digit PINs with Supabase Auth, retains shared-phone identity selection, and enforces IP/phone throttling.
- Existing schema supports shared phones because `members.phone_e164` is indexed but not unique. `member_accounts.member_id` and `auth_user_id` remain unique.
- Existing RLS allows writes through the authenticated, active-admin predicate. v2 database writes use the caller-scoped client so RLS and `auth.uid()` audit attribution remain effective.
- Existing `member_accounts_authorization_audit` trigger records requested, approved, suspended and reactivated transitions. Existing last-active-admin trigger remains enabled.
- The protected principal exists once in both TEST and Production. v2 compares an environment-specific SHA-256 digest of the stable Auth user ID selected by the already validated project ref. Raw IDs are not committed or logged; an unknown project fails closed.

## Candidate behavior

- New Edge Function `achang-member-admin-v2`; old function is not overwritten.
- Every request independently verifies the bearer token and a current `member_accounts` row with `role=admin,status=active`.
- Account creation does not require an approved administrator device. It does not remove session or role authentication.
- Volunteer and administrator accounts are created as `pending`; approval is a separate compare-and-set transition.
- Six ASCII digits, including a leading zero, are passed only to Supabase Auth. No PIN or hash is stored in application tables or logs.
- The Vercel API boundary canonicalizes formatted Taiwan mobile input (`09xx-xxx-xxx`, bare `09`, or `+8869`) to `+8869xxxxxxxx` before the strict Edge contract; invalid input is rejected before forwarding.
- Shared phone numbers remain separated by member/Auth identity; deterministic per-member synthetic Auth email and login ID are used.
- Duplicate same-member/same-role create is idempotent and does not rotate the PIN. Role mismatch is rejected.
- If Auth creation succeeds but the account insert fails, v2 compensates by deleting that just-created Auth identity; inability to prove cleanup fails closed.
- Suspend revokes the account's devices before its status transition. Reactivation does not restore devices.
- Self-suspension and suspension of the configured protected principal are rejected. There is no delete or role-change action.
- Denied v2 requests emit only action/status/code and a keyed actor hash; request bodies, phone numbers and PINs are not logged.
- The legacy `/api/members` route retains device list/approve/revoke behavior but no longer exposes account create/suspend/delete bypasses. Previous immutable deployment and old Edge Function remain rollback points.

## Tests

| ID | Result | Evidence boundary |
|---|---|---|
| TEST-01 active admin | PASS | Node dependency-isolated core test |
| TEST-02 admin without approved device can create | PASS | actual server/proxy source contract + Node test; no live TEST call yet |
| TEST-03 volunteer forbidden | PASS | Node dependency-isolated core test |
| TEST-04 unauthenticated forbidden | PASS | Node dependency-isolated core test |
| TEST-05 six-digit PIN | PASS | Node tests, including leading zero and no DB PIN field |
| TEST-06 PIN login compatibility | PARTIAL | actual old pin-login source inspected; new live Auth login not yet run |
| TEST-07 approve member | PASS locally | Node CAS test + synthetic Chromium UI/API |
| TEST-08 create admin | PASS locally | Node core + synthetic Chromium UI/API |
| TEST-09 no self escalation | PASS | Node test; API has no role-change operation |
| TEST-10 protected principal | PASS locally | stable-ID source/test; live TEST attempt not run |
| TEST-11 map/tasks/schedule regression | PASS locally | existing Chromium login suite + v2 Chromium control-presence test |
| TEST-12 audit trace | PASS schema/source; live pending | actual TEST trigger/function inspected read-only; no v2 live write yet |

Aggregate evidence:

- `npm test`: 35/35 PASS.
- `npm run test:browser`: PASS; local synthetic API only, all external requests blocked.
- `node test/ui-readonly-preview.browser.cjs`: PASS; synthetic read-only preview, zero `/api` requests.
- `node test/member-admin-v2.browser.cjs`: PASS; local synthetic API for create volunteer, approve volunteer, create admin, and preserved navigation controls.
- Deno 2.9.8 `check` on the v2 Edge entry: PASS using a type-only local Supabase client stub because this executor cannot reach JSR. This is not a live dependency fetch or live Edge invocation.

## Remaining isolated integration gate

No live TEST account, PIN, device, or database row was created by this candidate. No v2 Edge Function or Preview candidate was deployed.

To run browser → API → Auth/DB → login verification in TEST, the following bounded persistent TEST-only configuration is still required:

1. Confirm `ACHANG_EXPECTED_PROJECT_REF=fhxdpupascsikjsycpbi` is present for the new TEST function. No new secret is required for protected-principal matching.
2. Deploy only the new `achang-member-admin-v2` function to TEST with JWT verification enabled; do not replace `achang-admin-provision`.
3. Configure these variables only for Preview deployments from `feature/achang-member-admin-v2-20261028`: `ACHANG_ENVIRONMENT=test`, `ACHANG_TEST_ISOLATED=1`, `EXPECTED_SUPABASE_PROJECT_REF=fhxdpupascsikjsycpbi`, the existing TEST `SUPABASE_URL`, and the existing TEST `SUPABASE_PUBLISHABLE_KEY`. The publishable key is public client configuration, not a service-role credential.
4. Reassign the existing fixed integration alias `tainan-achang-online-ui-test-tjc1.vercel.app` to the verified candidate deployment. The candidate removes only this alias from the synthetic read-only host list; the older read-only preview hosts remain isolated.
5. Use bounded synthetic TEST fixtures for create/approve/login/audit, then preserve or clean them according to a stated fixture plan. Do not use Production or the protected principal as a fixture.

Production switch, merge and Production data changes remain out of scope.
