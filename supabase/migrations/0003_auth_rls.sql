-- Replace demo-open policies with authenticated team membership and role checks.
-- Auth accounts are linked to pre-registered staff by verified email.

alter table public.teams add column if not exists created_by_user_id uuid references public.users(id);

create or replace function public.link_auth_user_to_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users
     set user_id = new.id
   where lower(email) = lower(new.email)
     and (user_id is null or user_id = new.id);
  return new;
end;
$$;

drop trigger if exists link_auth_user_to_staff on auth.users;
create trigger link_auth_user_to_staff
after insert or update of email on auth.users
for each row execute function public.link_auth_user_to_staff();

create or replace function public.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
    from public.users u
   where u.user_id = (select auth.uid())
     and lower(u.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
   limit 1
$$;

create or replace function public.is_team_member(target_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
     where m.team_id = target_team and m.user_id = public.current_staff_id()
  )
$$;

create or replace function public.is_team_admin(target_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
     where m.team_id = target_team and m.user_id = public.current_staff_id() and m.role = 'admin'
  )
$$;

create or replace function public.create_team_workspace(team_name text)
returns public.teams
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_staff_id();
  created public.teams;
begin
  if actor_id is null or not exists (select 1 from public.users u where u.id = actor_id and u.role = 'admin') then
    raise exception 'Only an administrator can create a team workspace.' using errcode = '42501';
  end if;
  insert into public.teams (name, created_by_user_id) values (trim(team_name), actor_id) returning * into created;
  insert into public.team_members (team_id, user_id, role) values (created.id, actor_id, 'admin');
  return created;
end;
$$;

create or replace function public.register_team_user(target_team uuid, user_email text, user_name text, user_role text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public.current_staff_id();
  target_user uuid;
begin
  if not public.is_team_admin(target_team) then
    raise exception 'Only a team administrator can register a person.' using errcode = '42501';
  end if;
  if user_role not in ('staff','admin') or trim(user_name) = '' then
    raise exception 'Invalid team member details.' using errcode = '22023';
  end if;
  select id into target_user from public.users where lower(email) = lower(trim(user_email));
  if target_user is null then
    insert into public.users (email, full_name, role)
    values (lower(trim(user_email)), trim(user_name), user_role)
    returning id into target_user;
  end if;
  insert into public.team_members (team_id, user_id, role)
  values (target_team, target_user, user_role)
  on conflict (team_id,user_id) do update set role = excluded.role;
  return target_user;
end;
$$;

revoke all on function public.current_staff_id() from public, anon;
revoke all on function public.is_team_member(uuid) from public, anon;
revoke all on function public.is_team_admin(uuid) from public, anon;
revoke all on function public.create_team_workspace(text) from public, anon;
revoke all on function public.register_team_user(uuid,text,text,text) from public, anon;
grant execute on function public.current_staff_id() to authenticated;
grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.is_team_admin(uuid) to authenticated;
grant execute on function public.create_team_workspace(text) to authenticated;
grant execute on function public.register_team_user(uuid,text,text,text) to authenticated;

-- Keep booking owner and tenant immutable even for direct PostgREST updates.
create or replace function public.prevent_booking_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.team_id is distinct from old.team_id or new.booked_by_user_id is distinct from old.booked_by_user_id then
    raise exception 'A booking cannot be moved to another team or owner.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_booking_identity_change on public.bookings;
create trigger prevent_booking_identity_change before update on public.bookings
for each row execute function public.prevent_booking_identity_change();

-- Remove all permissive v1 policies, regardless of whether this migration is rerun.
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('users','teams','team_members','rooms','bookings','delegations','audit_logs')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

create policy users_team_read on public.users for select to authenticated
  using (id = public.current_staff_id() or exists (
    select 1 from public.team_members mine join public.team_members other on other.team_id = mine.team_id
    where mine.user_id = public.current_staff_id() and other.user_id = users.id
  ));
create policy users_admin_add on public.users for insert to authenticated
  with check (user_id is null and role in ('staff','admin') and exists (
    select 1 from public.team_members m where public.is_team_admin(m.team_id)
  ));

create policy teams_member_read on public.teams for select to authenticated
  using (public.is_team_member(id));
create policy teams_admin_update on public.teams for update to authenticated
  using (public.is_team_admin(id)) with check (public.is_team_admin(id));

create policy team_members_team_read on public.team_members for select to authenticated
  using (public.is_team_member(team_id));
create policy team_members_admin_add on public.team_members for insert to authenticated
  with check (public.is_team_admin(team_id));
create policy team_members_admin_update on public.team_members for update to authenticated
  using (public.is_team_admin(team_id)) with check (public.is_team_admin(team_id));
create policy team_members_admin_remove on public.team_members for delete to authenticated
  using (public.is_team_admin(team_id));

create policy rooms_member_read on public.rooms for select to authenticated
  using (public.is_team_member(team_id));
create policy rooms_admin_add on public.rooms for insert to authenticated
  with check (public.is_team_admin(team_id));
create policy rooms_admin_update on public.rooms for update to authenticated
  using (public.is_team_admin(team_id)) with check (public.is_team_admin(team_id));
create policy rooms_admin_remove on public.rooms for delete to authenticated
  using (public.is_team_admin(team_id));

create policy bookings_member_read on public.bookings for select to authenticated
  using (public.is_team_member(team_id));
create policy bookings_self_add on public.bookings for insert to authenticated
  with check (public.is_team_member(team_id) and booked_by_user_id = public.current_staff_id());
create policy bookings_owner_delegate_admin_update on public.bookings for update to authenticated
  using (public.is_team_member(team_id) and (
    booked_by_user_id = public.current_staff_id()
    or public.is_team_admin(team_id)
    or exists (select 1 from public.delegations d where d.team_id = bookings.team_id
      and d.delegator_user_id = bookings.booked_by_user_id
      and d.delegate_user_id = public.current_staff_id() and d.is_active)
  ))
  with check (public.is_team_member(team_id) and (
    booked_by_user_id = public.current_staff_id()
    or public.is_team_admin(team_id)
    or exists (select 1 from public.delegations d where d.team_id = bookings.team_id
      and d.delegator_user_id = bookings.booked_by_user_id
      and d.delegate_user_id = public.current_staff_id() and d.is_active)
  ));

create policy delegations_member_read on public.delegations for select to authenticated
  using (public.is_team_member(team_id));
create policy delegations_owner_add on public.delegations for insert to authenticated
  with check (public.is_team_member(team_id) and delegator_user_id = public.current_staff_id()
    and delegate_user_id <> public.current_staff_id()
    and exists (select 1 from public.team_members m where m.team_id = delegations.team_id and m.user_id = delegations.delegate_user_id));
create policy delegations_owner_update on public.delegations for update to authenticated
  using (public.is_team_member(team_id) and delegator_user_id = public.current_staff_id())
  with check (public.is_team_member(team_id) and delegator_user_id = public.current_staff_id());
create policy delegations_owner_remove on public.delegations for delete to authenticated
  using (public.is_team_member(team_id) and delegator_user_id = public.current_staff_id());

create policy audit_admin_read on public.audit_logs for select to authenticated
  using (public.is_team_admin(team_id));
create policy audit_member_add on public.audit_logs for insert to authenticated
  with check (public.is_team_member(team_id) and actor_user_id = public.current_staff_id());

-- Policies are authorization; explicit grants also remove anon table access.
revoke all on public.users, public.teams, public.team_members, public.rooms, public.bookings, public.delegations, public.audit_logs from anon;
grant select, insert on public.users to authenticated;
grant select, update on public.teams to authenticated;
grant select, insert, update, delete on public.team_members to authenticated;
grant select, insert, update, delete on public.rooms to authenticated;
grant select, insert, update on public.bookings to authenticated;
grant select, insert, update, delete on public.delegations to authenticated;
grant select, insert on public.audit_logs to authenticated;
