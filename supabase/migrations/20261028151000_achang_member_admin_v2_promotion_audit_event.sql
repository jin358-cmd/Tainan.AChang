-- Preserve the current authorization-event allowlist and add the event emitted
-- by achang_member_admin_v2_promote_admin. Without it, the role update and its
-- audit insert roll back together.
alter table public.member_authorization_events
  drop constraint member_authorization_events_event_type_check;

alter table public.member_authorization_events
  add constraint member_authorization_events_event_type_check
  check (event_type = any (array[
    'account_requested'::text,
    'account_approved'::text,
    'account_rejected'::text,
    'account_suspended'::text,
    'account_reactivated'::text,
    'device_requested'::text,
    'device_approved'::text,
    'device_revoked'::text,
    'member_archived'::text,
    'invite_issued'::text,
    'invite_consumed'::text,
    'admin_created'::text,
    'login_succeeded'::text,
    'login_failed'::text,
    'member_promoted_admin'::text
  ]));
