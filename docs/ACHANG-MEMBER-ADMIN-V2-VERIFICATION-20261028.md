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
- Shared phone numbers remain separated by member/Auth identity. Before Auth creation, a private database operation mapping persists one random hidden Auth alias for each member/role. Retries and service-key rotation reuse that mapping without exposing the member UUID or creating additional aliases. The mapping stores no PIN, phone or credential. The non-secret application login ID remains member-specific.
- Duplicate same-member/same-role create is idempotent and does not rotate the PIN. Role mismatch is rejected.
- If Auth creation succeeds but the account insert fails, v2 retains the deterministic, recoverable Auth identity and returns `CREATE_RETRY_REQUIRED`; a retry reuses that same identity. It never performs an eager Auth delete based on a stale absence read, preventing one concurrent request from deleting another request's successful identity/account binding.
- If the insert result and reconciliation read both fail, v2 returns `CREATE_OUTCOME_UNKNOWN` and likewise retains the possibly committed Auth identity. A retry first reconciles the account row or safely resumes with the same identity.
- Synthetic `@auth.achang.invalid` identities are rejected by the administrator-email application route. Because an Auth JWT can contain the email claim, alias secrecy alone is not treated as brute-force protection. A TEST-only Password Verification Hook migration is prepared to enforce a five-failure/15-minute account bucket on every direct Auth password attempt for synthetic identities. The hook is not enabled yet and brute-force verification remains PENDING.
- Approve, suspend and reactivate use one authenticated, RLS-bound database RPC. Suspend revokes devices and changes account status in the same PostgreSQL transaction, so a trigger/RLS/CAS failure rolls both changes back. Reactivation does not restore devices.
- Self-suspension and suspension of the configured protected principal are rejected. There is no delete or role-change action.
- Denied v2 requests emit only action/status/code and a keyed actor hash; request bodies, phone numbers and PINs are not logged.
- The legacy `/api/members` route retains device list/approve/revoke behavior but no longer exposes account create/suspend/delete bypasses. Previous immutable deployment and old Edge Function remain rollback points.

## Tests

| ID | Result | Evidence boundary |
|---|---|---|
| TEST-01 active admin | LOCAL PASS / LIVE PENDING | Node dependency-isolated core test; no live TEST actor request |
| TEST-02 admin without approved device can create | LOCAL PASS / LIVE PENDING | actual server/proxy source contract + Node test; no live TEST create |
| TEST-03 volunteer forbidden | LOCAL PASS / LIVE PENDING | Node dependency-isolated core test |
| TEST-04 unauthenticated forbidden | LOCAL PASS / LIVE PENDING | Node dependency-isolated core test |
| TEST-05 six-digit PIN | LOCAL PASS / LIVE PENDING | Node tests, including leading zero and no DB PIN field |
| TEST-06 PIN login compatibility | PARTIAL / LIVE PENDING | actual old pin-login source inspected; new Auth identity login not run |
| TEST-07 approve member | LOCAL PASS / LIVE PENDING | Node transaction contract + synthetic Chromium UI/API |
| TEST-08 create admin | LOCAL PASS / LIVE PENDING | Node core + synthetic Chromium UI/API |
| TEST-09 no self escalation | LOCAL PASS / LIVE PENDING | Node/source tests; no live denial event |
| TEST-10 protected principal | LOCAL PASS / LIVE PENDING | stable-ID source/test; live TEST denial not run |
| TEST-11 map/tasks/schedule regression | LOCAL PASS / LIVE PARTIAL | synthetic Chromium suite; logged-out cloud smoke only, interactive map fallback |
| TEST-12 audit trace | SOURCE VERIFIED / LIVE PENDING | actual TEST trigger/function inspected read-only; no v2 live write/audit row |

Aggregate evidence:

- Exact latest reviewed source: `9abac16ebd033db51c4a62d0793b153eaedb7f3c`.
- `npm test`: 45/45 LOCAL PASS on that source (Node mocks and static source/SQL assertions, including absent-bucket hook concurrency, A-fails/B-succeeds ownership safety, and credential-rotation-stable operation identity). This is not a live PostgreSQL concurrency test.
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
- The latest Draft PR source is `9abac16ebd033db51c4a62d0793b153eaedb7f3c`. It adds durable private operation-mapped Auth identity reuse, prepared Password Verification Hook objects, SQLSTATE-to-HTTP denied-event mapping, and ownership-safe recovery. It is not the deployed TEST runtime.
- Migration `20261028094500_achang_member_auth_operation_identity.sql` is committed but not applied to TEST.
- Migration `20261028093000_achang_pin_password_verification_hook.sql` is committed but not applied; its Auth Hook is not enabled. Owner action-time approval remains pending.
- Separate cloud-browser read-only smoke at 2026-10-28 09:49–09:50 UTC loaded the fixed TEST alias while logged out. `/api/config` showed `environment=test` and project ref `fhxdpupascsikjsycpbi`; login form open/close, five navigation tabs, logged-out task/roster privacy text, and public planner rendering worked. The map showed an offline fallback, so interactive map is not PASS. No credentials were entered and no account, device or business-data write occurred. This smoke did not independently establish runtime SHA and is not Auth E2E.

TEST actor/session prerequisite:

- The available cloud browser is currently logged out. No TEST administrator credential, PIN or token has been transferred in chat, and none should be.
- Live E2E requires an already authorized TEST administrator session on an authorized browser, or secure credential injection through an approved execution secret channel. Do not create a new administrator/bootstrap credential merely to unblock the run without separate authority.

Exact remaining checklist for browser → API → Auth/DB → login verification in TEST:

1. Obtain Owner approval to enable only the TEST Auth Password Verification Hook `public.achang_password_verification_hook(jsonb)` with five failed PINs / 15-minute account lockout. No Production hook change is included.
2. After approval, apply the two pending migrations to TEST and read back definitions, grants and hook configuration; do not apply them to Production.
3. Deploy exact source `9abac16` (or its reviewed successor) to the existing TEST Edge/function and fixed Preview alias; verify Git SHA, Edge version/hash, `verify_jwt=true`, TEST project ref and rollback points before login.
4. Establish an authorized TEST admin session through the secure prerequisite above. Run bounded synthetic create volunteer/admin → pending → approve → PIN login/device path → list/status → suspend/reactivate tests, including shared-phone separation, leading-zero PIN, five-failure lockout, changed-IP non-bypass, expiry, concurrency, denied roles and protected principal.
5. Read back only the scoped TEST Auth/account/device/audit rows and verify transaction rollback. Cleanup must use suspend/revoke and preserve audit history; no hard delete.
6. Complete independent review of the exact deployed SHA and classify TEST-01–12 from live evidence. Until then none of TEST-01–12 is an overall live PASS.
7. Production switch to `https://achang.pmos.space`, merge, and Production schema/function/data changes require the separate post-verification release authorization and remain out of scope.

Production switch, merge and Production data changes remain out of scope.
