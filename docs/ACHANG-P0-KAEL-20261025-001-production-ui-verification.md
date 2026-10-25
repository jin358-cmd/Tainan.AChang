# ACHANG-P0-KAEL-20261025-001｜Production UI Verification

Evidence time：2026-10-25T13:00+08:00  
Repository：`jin358-cmd/Tainan.AChang`  
Draft PR：#2（未合併）  
Release commit：`925503f2fb01325be438cce3a57647bf5b932d91`

## Release outcome

固定正式網址已更新為本輪通過 Test 真實 E2E 的版本：

- Production URL：`https://tainan-achang-online.vercel.app/`
- Vercel Deployment ID：`dpl_DNhLKr3MhJe2hUjsBamu29mZ2Gn9`
- Deployment URL：`https://tainan-achang-online-20kht9pdu-tjc1.vercel.app`
- Target／State：`production`／`READY`
- Runtime identity：`environment=production`
- Supabase Project Ref：`ctskglmglevronvnkpmm`
- Frontend asset revision：`app.js?v=187`

## Test-before-Production evidence

- Fixed Test URL：`https://tainan-achang-pin-eipp-test.vercel.app/`
- Test deployment：`dpl_8skTySKKGQKtSLivZ5WqzT4FKRJF`
- Live Test Run ID：`ACHANG-LIVE-2026-10-25T04:49:58.032Z`
- Node regression：27/27 PASS
- Browser regression：PASS
- Real Test Supabase Auth／API／RLS：PASS
- Two independent browser contexts and device IDs：PASS
- Synthetic fixture cleanup：PASS
- Test baseline after cleanup：members=41, accounts=1, devices=0, authorization_events=0

Live Test 覆蓋：管理員登入與導覽、邀請碼錯誤與一次性核銷、會員申請與核准、兩個獨立裝置、單一裝置撤銷、會員停用與恢復、新增管理員與裝置核准、過期邀請碼拒絕、Test 隔離與 Google OAuth wiring。

## Production database and Edge Functions

- Migration：`20261025045331_achang_phone_pin_admin_controls` PASS
- `achang-pin-login`：version 5 ACTIVE，JWT 由函式內驗證
- `achang-member-apply`：version 2 ACTIVE，邀請碼與 PIN 由函式內驗證
- `achang-admin-provision`：version 7 ACTIVE，JWT required
- Last active administrator guard：PASS
- Device approval gate column：PASS
- Audit subject hash and required indexes：PASS

Production row counts before and after release were identical:

| Table | Before | After |
| --- | ---: | ---: |
| `members` | 46 | 46 |
| `member_accounts` | 3 | 3 |
| `member_devices` | 9 | 9 |
| `member_authorization_events` | 3 | 3 |

No synthetic Production member, account, device, or authorization event was created.

## Fixed Production URL UI verification

Direct browser operation on `https://tainan-achang-online.vercel.app/` confirmed:

- Phone number + six-digit PIN login form：PASS
- Google login button：PASS（entry and wiring; external consent completion remains Owner acceptance）
- Top-right member application entry：PASS
- Four-digit invite, roster phone, and six-digit PIN application form：PASS
- Map page and MapLibre controls：PASS
- Service area page：PASS
- Patrol schedule page：PASS
- Task page fail-closed before login：PASS
- Roster page protects names, phones, addresses, and assignment actions before login：PASS

## Functional scope now available

- Phone + PIN login for administrators and volunteers
- Four-digit, 24-hour, one-time member invite flow
- Pending member approval
- First and additional device approval
- Individual device revocation without affecting other approved devices
- Member suspension and controlled reactivation
- Revoked device remains revoked and may only reapply as Pending
- Administrator creation, suspension, and recovery
- Final active administrator protection
- Audit records for invite, login, account, device, and administrator actions

## Remaining Owner acceptance

- Two physical-phone operation remains Owner UI acceptance; the equivalent two-independent-client live Test flow passed.
- Google OAuth external account-consent callback remains Owner UI acceptance; provider URL and redirect wiring passed.
- Draft PR #2 remains unmerged by design.
- EIPP-11 database recovery gate remains PASS, while platform-complete recovery remains PARTIAL because PostgreSQL dump alone does not contain all Supabase-managed settings, provider configuration, external keys, Edge Function secrets, or platform extensions.

## Security notes

- `achang_pin_login_buckets` has RLS enabled with no user policy intentionally; it is service-role-only and fails closed.
- Supabase Advisor still reports the pre-existing `achang_group_contacts` SECURITY DEFINER exposure and disabled leaked-password protection. They were not silently changed during this release.
- No secret was added to Git, terminal evidence, or this report.

## Gate

- `TEST_LIVE_E2E=PASS`
- `PRODUCTION_MIGRATION=PASS`
- `PRODUCTION_EDGE_FUNCTIONS=PASS`
- `PRODUCTION_DEPLOYMENT=PASS`
- `PRODUCTION_UI_READBACK=PASS`
- `PRODUCTION_DATA_COUNTS_UNCHANGED=PASS`
- `OWNER_PHYSICAL_DEVICE_ACCEPTANCE=PENDING`
- `PR_MERGE=NOT_EXECUTED`
