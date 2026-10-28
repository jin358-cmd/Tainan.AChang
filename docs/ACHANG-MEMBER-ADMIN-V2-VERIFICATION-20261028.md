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
- Shared phone numbers remain separated by member/Auth identity. The hidden Auth email alias is deterministically derived from the server credential plus member/role, so a retry reuses the same Auth identity without exposing the member UUID or creating additional aliases. The non-secret application login ID remains member-specific.
- Duplicate same-member/same-role create is idempotent and does not rotate the PIN. Role mismatch is rejected.
- If Auth creation succeeds but the account insert fails, v2 compensates by deleting that just-created Auth identity; inability to prove cleanup fails closed.
- If the insert result and reconciliation read both fail, v2 returns `CREATE_OUTCOME_UNKNOWN` and deliberately does not delete the possibly committed Auth identity. A retry first reconciles the account row and becomes idempotent.
- Synthetic `@auth.achang.invalid` identities are rejected by the administrator-email application route. Because an Auth JWT can contain the email claim, alias secrecy alone is not treated as brute-force protection. A TEST-only Password Verification Hook migration is prepared to enforce a five-failure/15-minute account bucket on every direct Auth password attempt for synthetic identities. The hook is not enabled yet and brute-force verification remains PENDING.
- Approve, suspend and reactivate use one authenticated, RLS-bound database RPC. Suspend revokes devices and changes account status in the same PostgreSQL transaction, so a trigger/RLS/CAS failure rolls both changes back. Reactivation does not restore devices.
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

- `npm test`: 42/42 PASS at source commit `55fe6d1e80d2dba084299996cb711f005ce882b0`.
- `npm run test:browser`: PASS; local synthetic API only, all external requests blocked.
- `node test/ui-readonly-preview.browser.cjs`: PASS; synthetic read-only preview, zero `/api` requests.
- `node test/member-admin-v2.browser.cjs`: PASS; local synthetic API for create volunteer, approve volunteer, create admin, and preserved navigation controls.
- Deno 2.9.8 `check` on the v2 Edge entry: PASS using a type-only local Supabase client stub because this executor cannot reach JSR. This is not a live dependency fetch or live Edge invocation.

## Remaining isolated integration gate

No live TEST account, PIN, device, or member row was created by this candidate.

Isolated deployment evidence for commit `db3e3ba331843912cdd1f876f2733a99dd7dd59d`:

- Vercel Preview `dpl_9BfULZpP3vTSup692GyPGQXikpgs` is `READY`; the existing fixed TEST alias `tainan-achang-online-ui-test-tjc1.vercel.app` resolves to this deployment. Production aliases were not changed.
- TEST Edge `achang-member-admin-v2` is ACTIVE v2, `verify_jwt=true`, deployment digest `95b6121ac996ba9981501e2206c241b23045469c8d170dcc035ce40dcd345349`. Its retrieved files include the random Auth alias and atomic RPC integration.
- TEST migration `achang_member_admin_v2_atomic_transition` applied successfully. Readback confirms invoker security, empty search path, authenticated-only application grant, row lock/CAS, protected-principal check, and transactional device/account updates.
- Supabase security advisor reported no new v2/RPC finding. Existing unrelated findings remain: the internal PIN bucket table has RLS with no public policy (expected server-only access), and leaked-password protection is disabled.
- Direct HTTP from this executor is BLOCKED before reaching Vercel or Supabase (`Envoy CONNECT 403`). No browser-control tool is available in this executor. Therefore live browser → API → Auth/DB → login remains PENDING, not PASS.

Deployment/source boundary:

- The fixed TEST alias and Edge v2 evidence above remain the deployed `db3e3ba` candidate.
- Source commit `55fe6d1` adds durable secret-derived Auth identity reuse, prepared (not activated) Password Verification Hook objects, and SQLSTATE-to-HTTP denied-event mapping. It is pushed to the Draft PR but is not the deployed TEST runtime.
- Separate cloud-browser read-only smoke at 2026-10-28 09:49–09:50 UTC loaded the fixed TEST alias while logged out. `/api/config` showed `environment=test` and project ref `fhxdpupascsikjsycpbi`; login form open/close, five navigation tabs, logged-out task/roster privacy text, and public planner rendering worked. The map showed an offline fallback, so interactive map is not PASS. No credentials were entered and no account, device or business-data write occurred. This smoke did not independently establish runtime SHA and is not Auth E2E.

To run browser → API → Auth/DB → login verification in TEST, the following bounded persistent TEST-only configuration is still required:

1. Use an authorized browser/network path to run bounded synthetic TEST fixtures through create/approve/login/audit. Do not use Production or the protected principal as a fixture.
2. Explicitly authorize enabling the TEST Auth Password Verification Hook `public.achang_password_verification_hook(jsonb)`. This changes TEST Auth security configuration; its migration/function may be reviewed before activation. No Production hook change is authorized.
3. Verify the resulting Auth/account/audit rows and rollback/cleanup behavior in TEST, including shared-phone separation, direct Auth rate limiting and leading-zero PIN login.
4. Complete independent Code Review of the exact Draft PR head and record the remaining PARTIAL/PENDING gates.
5. Production switch to `https://achang.pmos.space`, merge, and Production data/schema/function changes require the post-verification release gate and remain out of scope for this record.

Production switch, merge and Production data changes remain out of scope.
