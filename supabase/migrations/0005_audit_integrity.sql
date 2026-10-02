-- Keep audit history authoritative: only database triggers write audit events.
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check check (status in ('confirmed', 'cancelled'));

drop policy if exists audit_member_add on public.audit_logs;
revoke insert, update, delete on public.audit_logs from authenticated, anon;
grant select on public.audit_logs to authenticated;
drop policy if exists users_admin_add on public.users;
revoke insert on public.users from authenticated;

create or replace function public.prevent_room_team_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.team_id is distinct from old.team_id then
    raise exception 'A room cannot be moved to another team.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_room_team_change on public.rooms;
create trigger prevent_room_team_change before update on public.rooms
for each row execute function public.prevent_room_team_change();

create or replace function public.prevent_delegation_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.team_id is distinct from old.team_id
     or new.delegator_user_id is distinct from old.delegator_user_id
     or new.delegate_user_id is distinct from old.delegate_user_id then
    raise exception 'A delegation cannot be moved to another team or person.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_delegation_identity_change on public.delegations;
create trigger prevent_delegation_identity_change before update on public.delegations
for each row execute function public.prevent_delegation_identity_change();

create or replace function public.audit_booking_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_action text;
  before_row jsonb;
  after_row jsonb;
begin
  if tg_op = 'INSERT' then
    event_action := 'create';
    before_row := null;
    after_row := jsonb_build_object('title', new.title, 'room_id', new.room_id, 'start_time', new.start_time, 'end_time', new.end_time, 'status', new.status);
  else
    before_row := jsonb_build_object('title', old.title, 'room_id', old.room_id, 'start_time', old.start_time, 'end_time', old.end_time, 'status', old.status);
    after_row := jsonb_build_object('title', new.title, 'room_id', new.room_id, 'start_time', new.start_time, 'end_time', new.end_time, 'status', new.status);
    event_action := case when old.status <> 'cancelled' and new.status = 'cancelled' then 'cancel' else 'update' end;
  end if;
  insert into public.audit_logs (team_id, booking_id, action, actor_user_id, changes)
  values (new.team_id, new.id, event_action, public.current_staff_id(), jsonb_build_object('before', before_row, 'after', after_row));
  return new;
end;
$$;
drop trigger if exists bookings_write_audit on public.bookings;
create trigger bookings_write_audit after insert or update on public.bookings
for each row execute function public.audit_booking_change();

create or replace function public.audit_delegation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_action text;
begin
  if tg_op = 'INSERT' then
    if not new.is_active then return new; end if;
    event_action := 'delegation_granted';
  else
    if old.is_active is not distinct from new.is_active then return new; end if;
    event_action := case when new.is_active then 'delegation_granted' else 'delegation_revoked' end;
  end if;
  insert into public.audit_logs (team_id, booking_id, action, actor_user_id, changes)
  values (new.team_id, null, event_action, public.current_staff_id(), jsonb_build_object('delegation_id', new.id, 'delegate_user_id', new.delegate_user_id));
  return new;
end;
$$;
drop trigger if exists delegations_write_audit on public.delegations;
create trigger delegations_write_audit after insert or update on public.delegations
for each row execute function public.audit_delegation_change();
