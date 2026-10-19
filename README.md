# Tainan.AChang 正式線上系統｜v0.9.1

**部署狀態：PREVIEW 驗證階段，初始管理員及志工帳號尚待 Owner 開通。**

## 系統資料
- 專屬 Supabase project `ctskglmglevronvnkpmm`，安全讀回 38 名正式志工、34 筆電話、5 筆可確認原居住里預排。個資從未提交公開 GitHub。
- 已確認使用真實資料庫資料表 `members`、`member_accounts`、`member_devices`、`service_allocations`、`assignments`、`visit_tasks`、`task_events`。
- `achang-admin-provision` Edge Function 由 Supabase server-side 控管 service_role，先認證 active admin 才能新增志工帳號。
- Vercel API 使用 Supabase **publishable key** 與使用者 JWT，透過 HttpOnly Secure SameSite=Strict cookie 管理登入，無 service_role / 密碼在 GitHub。
- RLS 限制志工只能讀自己的資料，管理員才可新增／修改名冊、安排跟巡；志工任務完成由 `task_events` 觸發器帶版本控制同步至資料庫。
- 資料庫唯一索引：同人／同日期／同日夜時段不可重複安排。
- 志工電話+個人密碼登入後首次裝置為 `pending`，須管理員核准，不能任意輸入電話取得資料；這不是 SMS OTP。
- Vercel 管理員與志工狀態在登入後每 15 秒重讀雲端資料；離線僅快取靜態 UI，離線時無法送出完成回報。

## Owner 啟用 Gate（必須完成後才能實際以正式帳號登入）
1. Owner 在 **Supabase 官方 Dashboard → Authentication → Users**，建立自己的管理員手機與強密碼，先確認 Auth User UUID。**不得將密碼傳到 ChatGPT、GitHub 或註冊到公開畫面**。
2. 在 Supabase SQL Editor 於 `public.members` 建立對應管理員紀錄（不能冒充 38 位志工），再於 `public.member_accounts` 對照該 auth_user_id，`role='admin'`,`status='active'`。由 Owner 在安全介面親自核對 SQL 內容與 ID。
3. 從 Vercel 受控 PREVIEW URL 登入管理員，建立志工個人帳號、設置初始密碼（私下安全管道交付），核准志工裝置。
4. 在 Vercel 管理頁為志工排定日期、日/夜、車次、地址、到達時間；志工登入後檢視自己的任務並按「已完成」，管理員於另一台裝置確認雲端已更新。
5. 依 QA 測試核對角色、RLS、跨裝置進度、資料分隔、手機 PWA 安裝與恢復機制；Owner Confirmation 後才授權正式發佈。

## 限制與個資保護
- GitHub public 版本只保存可公開的行政里界、清運選錄表、原始碼及公開 publishable key。**不能保存電話、姓名、詳細住宅地址、secret、離線已授權名冊或本機儲存匯出**。
- 本版本只使用服務里分派與跟巡任務的雲端資料，不等於車輛 GPS 即時追蹤。
- 工作現場以官方清運表核對；停靠點資料為 2025-09-06 選錄資料。
- 沒有雲端帳號、管理員初始化與 E2E 證據時不得稱為全面完成。

Document ID：HC-TAC-ONLINE-20261019-001｜Version：v0.9.1｜Status：PREVIEW PENDING OWNER ADMIN ACTIVATION