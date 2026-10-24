# ACHANG-AUTH-20261024-P0-001 驗證與部署申請報告

日期：2026-10-24

範圍：FIX 01–05

Production：**🟡 PENDING OWNER APPROVAL（未修改、未部署）**

## 1. 結論

修復已建立於 `fix/achang-auth-20261024-p0-001`，基底是 Vercel 目前 Production 實際部署 commit `3977884e982d16872f98961e6c46622b7bdffd2c`。程式、Migration、隔離 PostgreSQL 驗證及本機瀏覽器回歸已完成；正式 Supabase Migration、Edge Functions 與 Vercel Production 均未套用。

目前正式資料唯讀快照：`members=45`、`member_accounts Active=3 / Pending=0`、`member_devices Revoked=8 / Pending=0 / Approved=0`、Auth users `7`、重複聯絡電話 `3` 組（共 `6` 位會員）、孤兒關聯 `0`。此快照只用於診斷，沒有改寫資料。

## 2. 根因與五項修正前後對照

| 項目 | 根因／修正前 | 修正後 | 狀態 |
|---|---|---|---|
| 重複電話 | Provision 與 PIN login 都要求電話只命中一位會員；電話實際是非唯一聯絡資料 | Auth 使用 member UUID 衍生的內部 email，登入使用獨立 `ACH-<UUID>`；電話只作邀請核對 | 🟢 PASS（隔離資料與程式驗證） |
| Pending 不顯示 | 沒有完整的志工自助申請→Pending 帳號流程，管理頁也未分層呈現 | 一次性 24h 邀請碼、自訂 PIN、建立 Pending；管理頁分開帳號 Pending 與裝置 Pending，可核准／拒絕並留原因 | 🟠 PARTIAL（待正式 E2E） |
| 六碼 PIN | 以非唯一電話查會員，重複電話直接失敗 | Edge Function 依唯一 login ID 找 Auth 身分；PIN 交 Supabase Auth 雜湊驗證，另有 login/IP rate limit 與狀態閘門 | 🟠 PARTIAL（待正式 Auth E2E） |
| 裝置／PWA | `(account_id, device hash)` 全域唯一；Revoked 舊列阻止同裝置建立新 Pending；登入失敗訊息混淆 | Revoked 保留為不可變歷史；只限制 Pending/Approved 當前綁定唯一；重新登入建立新 Pending；HttpOnly session 保留，核准後 PWA 重新檢查即可進入 | 🟢 PASS（隔離 DB）／🟠 PARTIAL（待真機） |
| 刪除同步 | 舊流程可能實體刪除帳號，名冊則以 `ARCHIVED-` 隱藏，語意不一致 | `deleted_at/by/reason` 軟刪除；Trigger 原子停用帳號、撤銷裝置、保留會員／排班／任務 FK 與稽核事件；名冊只讀未刪除會員 | 🟢 PASS（隔離 DB）／🟠 PARTIAL（待正式 E2E） |

## 3. EIPP-01–13

| EIPP | 檢查結果與原因 | 修正／證據 | 狀態 |
|---|---|---|---|
| 01 Repository | `jin358-cmd/Tainan.AChang` | Git remote 已確認 | 🟢 PASS |
| 02 Branch | Vercel Production 來源為 `restore-admin-map-20261018-2226-20261023` / `3977884`，不是本機原先預覽分支 | 修復分支已重基於實際部署 commit | 🟢 PASS |
| 03 Runtime | Vercel Project `tainan-achang-online`，Node 24.x；package 要求 Node >=22 | Node 測試與瀏覽器測試成功 | 🟢 PASS |
| 04 Environment Variables | 正式 Supabase URL/project 已確認；前端只含 publishable key，service role 僅由 Supabase Edge runtime 讀取 | 測試確認 server bundle 無 service-role key | 🟢 PASS |
| 05 Authentication | 管理員 email/Google；志工原為電話+PIN；Auth user 與 member account 分離但電話解析造成衝突 | 志工改為 login ID + PIN；帳號與裝置雙閘門 | 🟠 PARTIAL（正式 E2E 待部署） |
| 06 Database | Schema、索引、FK、45/3/8 現況已唯讀重查；phone 沒有 unique constraint | Migration 在 PostgreSQL 17 隔離容器通過；補 partial unique、FK/query indexes、稽核與 soft delete | 🟢 PASS（設計／隔離） |
| 07 RLS | 相關表已啟用 RLS；管理員／會員 policy 已檢視。現行 advisor 另提示既有 `achang_group_contacts` SECURITY DEFINER 與 leaked-password protection，非本次新增 | 新稽核表啟用 RLS，只允許 authenticated admin select；trigger function 固定空 search_path 並撤銷 public execute | 🟢 PASS（本次變更） |
| 08 API | 已檢查建立、核准、登入、撤銷、名冊刪除路徑 | 新增 application API，重寫登入，擴充分層核准／撤銷／封存 | 🟠 PARTIAL（正式 E2E 待部署） |
| 09 Session | HttpOnly/Secure/SameSite cookies；access 短效、refresh 90 天；恢復時重查帳號與裝置 | 裝置 Pending 回 202 並保留 server session；PWA resume 再驗證 | 🟢 PASS（單元／瀏覽器合成）／🟠 PARTIAL（真機） |
| 10 Device Binding | 正式 8 Revoked、0 Approved；舊唯一限制阻斷重新申請 | Revoked 不恢復，建立新的 Pending；管理員只能核准 Pending | 🟢 PASS（隔離 DB） |
| 11 Backup | 專案為 Free plan；官方 daily backup 不涵蓋 Free，且未取得已驗證的 off-site dump／restore 證據 | Production 套 Migration 前必須先產生並驗證 CLI dump 或升級至具備備份的方案 | 🔴 BLOCKED |
| 12 Testing | 本機 Node、Chromium 與隔離 PostgreSQL 17 可執行 | 單元 16/16、瀏覽器回歸、Migration assertions、Edge compile（見下） | 🟢 PASS（隔離環境） |
| 13 Deployment Gate | 開發已授權，Production 尚未授權；Free plan backup 是額外 gate | 不部署；Owner 核准前要求備份、preview/live E2E、rollback command 與 migration review | 🟡 PENDING |

## 4. 程式與 Schema 差異

- `members`：新增 soft-delete 欄位、一次性申請碼 hash/expiry；電話保持非唯一。
- `member_accounts`：新增唯一 `login_id`、requested/rejected 時間與拒絕原因；既有志工以 member UUID 回填。
- `member_devices`：新增 requested/rejection 欄位；撤銷全域 unique，改成只涵蓋 Pending/Approved 的 partial unique；另保留完整 account lookup index。
- `member_authorization_events`：新增只供管理員讀取的稽核表與狀態 trigger。
- 新增 `achang-member-apply` 與重寫 `achang-pin-login`；修正 `achang-admin-provision`。
- API/UI 新增申請、帳號 Pending、裝置 Pending、重新綁定、拒絕理由與軟刪除流程。
- Service Worker cache 更新為 `v116-auth-repair`；未更動地圖資料、任務資料或排班資料。

Migration：`supabase/migrations/20261024050539_achang_auth_identity_pending_device_soft_delete.sql`

## 5. 十二項整合驗收

正式 Production 未獲部署許可，因此凡需真實 Auth、真機或正式 API 的項目均不得宣告完整 PASS。

| Test | 證據 | 狀態 |
|---|---|---|
| 01 共用電話、兩人獨立 | PostgreSQL fixture 保留兩位相同 phone；回填兩個不同 login ID；程式不再用 phone 建 Auth | 🟢 PASS（隔離） |
| 02 新會員產生 Pending | application Edge source/unit assertions；UI/API 路徑完成 | 🟠 PARTIAL（待 live） |
| 03 管理員核准 | API 僅更新指定 auth user；audit trigger 記錄狀態 | 🟠 PARTIAL（待 live） |
| 04 六碼 PIN 正確會員 | login ID lookup、Supabase Auth、帳號狀態、兩層 rate limit 靜態／單元驗證 | 🟠 PARTIAL（待 live Auth） |
| 05 已核准原裝置登入 | Approved 優先選取與 session cookie 測試 | 🟠 PARTIAL（待真機） |
| 06 失效裝置重新申請 | 真實 PostgreSQL fixture：既有 Revoked 下成功插入新 Pending | 🟢 PASS（隔離） |
| 07 核准重新綁定 | fixture 將新 Pending 核准；舊 Revoked 列仍保留 | 🟢 PASS（隔離） |
| 08 PWA 再開一鍵進入 | Chromium 合成 session resume/logout/reopen；HttpOnly cookie assertion | 🟠 PARTIAL（待真機） |
| 09 前台刪除同步 | 真實 PostgreSQL trigger：member archived、account suspended、device revoked、audit retained | 🟢 PASS（隔離） |
| 10 已刪除會員電話可重用 | phone 不參與唯一性或帳號查找；fixture 保留重複電話 | 🟢 PASS（隔離） |
| 11 撤銷後禁止存取 | 每次 session 經 `accountFromToken` 和 `deviceCheck`；撤銷 API 不會恢復 revoked | 🟠 PARTIAL（待 live） |
| 12 地圖／排班／任務／名冊回歸 | Node map tests + Chromium admin/volunteer、session、failure、map fallback；外部請求封鎖 | 🟢 PASS（本機回歸） |

## 6. 驗證命令與證據

- `npm test` → 16 tests, 16 passed, 0 failed。
- `npm run test:browser` → PASS；本機 synthetic API，所有外部請求封鎖；無未預期 page/console error。
- PostgreSQL 17 container：fixture → migration → assertions → `MIGRATION_ASSERTIONS_PASS`。
- Edge compile：三個 Edge Functions 以 esbuild 並將 `jsr:` 套件標為 external，均成功。
- `rg` conflict-marker 掃描：0 筆。

## 7. Production 風險與回滾

主要風險：Migration 會替既有帳號回填 login ID、替裝置唯一性改為 partial unique，並新增 trigger；API 與 Edge Functions 必須和 Schema 同一維護窗口發布。Free plan 沒有可證實的 daily backup，是目前唯一硬性 BLOCKER。

建議部署順序：

1. 建立並驗證 Production schema/data/auth 可回復備份，記錄 checksum 與 restore 演練結果。
2. 設維護窗口；保存目前 Vercel deployment `3977884` 與現行 Edge Function versions。
3. 套用 Migration；立即檢查 row counts、duplicate phones、orphans、constraint/index、RLS/advisors。
4. 部署三個 Edge Functions，再發布 Vercel preview，執行 TEST 01–12。
5. Owner 驗收後才 promote Production。

回滾原則：Vercel 回切 `3977884`；Edge Function 回復已記錄版本。Schema rollback 不直接刪除新欄位或稽核資料；先停用新入口與 triggers，從部署前備份還原至隔離環境驗證，再由 Owner 決定 forward-fix 或受控 restore。不得以批次恢復全部 Revoked 裝置作為回滾。

## 8. Owner Verification Report

- 🟢 PASS：正式來源辨識、根因分析、修復分支、Migration、隔離資料驗證、本機單元與瀏覽器回歸。
- 🔴 BLOCKED：Production backup/restore 證據。
- 🟡 PENDING：GitHub PR review、preview/live TEST 01–12、Owner Production 部署核准。
- Production 目前狀態：**未變更**。
- Owner 核准前置條件：完成 EIPP-11、review Migration/RLS、確認部署窗口與 rollback owner、在非 Production 或受控 preview 取得真實 Auth/真機證據。

最終判定：**🟠 PARTIAL — 開發與隔離驗證完成；不得部署 Production。**
