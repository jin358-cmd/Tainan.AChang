# Tainan.AChang 線上系統｜v0.9.2 hardening

**部署狀態：SOURCE QA。Production 仍是舊版；個人資料編輯 grant migration 尚待 Owner 動作當下核准，不可先部署本分支。**

## 系統資料
- 專屬 Supabase project `ctskglmglevronvnkpmm`，安全讀回 38 名正式志工、34 筆電話、5 筆可確認原居住里預排。個資從未提交公開 GitHub。
- 已確認使用真實資料庫資料表 `members`、`member_accounts`、`member_devices`、`service_allocations`、`assignments`、`visit_tasks`、`task_events`。
- `achang-admin-provision` Edge Function 由 Supabase server-side 控管 service_role，先認證 active admin 才能新增志工帳號。
- Vercel API 使用 Supabase **publishable key** 與使用者 JWT，透過 HttpOnly Secure SameSite=Strict cookie 管理登入，無 service_role / 密碼在 GitHub。
- RLS 限制志工只能讀自己的資料，管理員才可新增／修改名冊、安排跟巡；志工任務完成由 `task_events` 觸發器帶版本控制同步至資料庫。
- 資料庫唯一索引：同人／同日期／同日夜時段不可重複安排。
- 管理員使用已驗證 Email + 密碼；志工使用已核准電話 + 個人密碼。志工首次裝置為 `pending`，須管理員核准，不能任意輸入電話取得資料；這不是 SMS OTP。
- 管理員完整名冊會排除 `ADMIN-*` 內部身分；後端也拒絕內部身分被修改、開通或排為志工。
- 一般志工的個人資料預設唯讀。管理員可在「名冊 → 人員授權」授權特定 active volunteer 帳號在線編輯自己的姓名、地址、居住里；editor 不等於 admin、不能看完整名冊、不能改登入電話或授權他人。
- 已核准且離線期限有效的志工裝置可快取自己的任務並建立待同步完成事件；只有伺服器確認後才顯示已同步。離線時不得取得或使用個人資料編輯 grant。

## Owner 啟用 Gate（必須完成後才能實際以正式帳號登入）
1. Owner 在安全介面核對既有管理員 Email Auth 與 active admin mapping；**不得將密碼傳到 ChatGPT、GitHub 或公開畫面**。
2. 在動作當下明確核准後，才可套用 `backend/004_profile_edit_grants.sql`；它新增預設 false 的 scope 與只更新本人非身分欄位的窄 RPC，不開放 members 一般 UPDATE policy。
3. 從受控 Preview 登入管理員，建立匿名測試志工帳號、核准測試裝置，驗證預設唯讀、grant/revoke、電話冒用拒絕與 admin-only 授權管理。
4. 驗證排班、日/夜去重、志工自己的任務完成、離線 outbox、重新連線冪等及雙裝置衝突。
5. 核對角色、RLS、資料分隔、手機 PWA 安裝與回退基準；全部通過後才對齊 Production alias。

## 限制與個資保護
- GitHub public 版本只保存可公開的行政里界、清運選錄表、原始碼及公開 publishable key。**不能保存電話、姓名、詳細住宅地址、secret、離線已授權名冊或本機儲存匯出**。
- 本版本只使用服務里分派與跟巡任務的雲端資料，不等於車輛 GPS 即時追蹤。
- 工作現場以官方清運表核對；停靠點資料為 2025-09-06 選錄資料。
- 沒有雲端帳號、管理員初始化與 E2E 證據時不得稱為全面完成。

Document ID：HC-TAC-ONLINE-20261019-001｜Version：v0.9.2-hardening｜Status：SOURCE QA / PROFILE GRANT MIGRATION APPROVAL REQUIRED
