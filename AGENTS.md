# Tainan.AChang｜Agent Project Instructions
Version: 1.0
Owner directive date: 2026-10-28
Project: 台南永康十里／阿昌志工地圖
Status: Owner-directed project operating rules

## Project continuity
This is ONE ongoing project, not a new project each day or each chat. Before making changes, inspect the existing repository, Vercel project, deployment source, app authentication and previous task context. Never silently restart or fork work into a new project.

## Single user-facing site
- **ONLY user-facing URL: https://achang.pmos.space**
- Vercel project: `tainan-achang-online` (project ID `prj_fGn6iRK8V1aGiBS1vikT5xEs5wTC`).
- For Owner-authorized UI changes, deploy to the existing production project and keep the same domain.
- **Do not create a new test site, project, domain, Preview alias, or new user-facing test URL without explicit Owner direction.**
- Vercel's immutable per-deployment URLs may be generated internally; they are NOT new user-facing entry points and must not be offered as a substitute for the approved site.
- Do not bind or rebind domains or modify authentication/protection settings without explicit Owner instruction.

## Preserve data and access
- A UI update must not delete, reset, overwrite or migrate membership records, volunteer accounts, admin access, device authorizations, schedule history, or production database records.
- Avoid replacing production authentication with preview-only or read-only auth code. Compare actual runtime/env requirements before deploy.
- Never disable auth or authorization controls to make UI testing easier.
- Changes affecting data, permissions, security or authentication must be separately identified and reviewed rather than hidden in UI updates.

## Deployment and acceptance
1. Check existing production source, specified UI baseline and exact diff before changes.
2. Make the requested UI changes in the existing repository; avoid unrelated rewrites.
3. Verify/build and deploy only to the approved existing production project when Owner has instructed production deployment.
4. Verify `https://achang.pmos.space` maps to the expected commit, responds successfully, and serves intended assets.
5. Check user journeys for volunteer/admin login as feasible. Do NOT equate Vercel READY or HTTP 200 with successful role login.
6. Report commit, deployment ID, domain verification, outstanding untested functions, and any rollback path.
7. Never claim UI or login PASS without actual supporting verification.

## Source of truth and exceptions
The Owner's latest specific instruction takes precedence. If an action cannot meet these constraints, state the blocker and ask before changing site identity or using an alternate entry point. Do not claim this file alone prevents Vercel from generating deployment URLs or guarantees all external agents will follow it.
