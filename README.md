# Tainan.AChang PWA v1.0.4 | verified six-digit volunteer PIN and phone approval

- The map, 10-village service allocation UI, route roster and PWA remain aligned to the Owner-approved v0.4 reference.
- Admins create the volunteer profile and provision a phone-based account with a six-digit numeric PIN; volunteer phone formatting is normalized by the server.
- Volunteer first login requests device authorization. Admins can approve pending devices in the member authorization modal. An approved device with valid session resumes directly into the volunteer tasks page.
- Member records are stored in Supabase under RLS; no real roster, PIN, private tokens or access credentials are embedded in this public repo.
- Only administrators can add/edit volunteers, assign work, and approve/revoke accounts. Server enforces permissions.
- Deployment can be verified online, but a real admin + volunteer two-device E2E requires the authorized Owner to perform sign-in, creation and approval; never claim otherwise.