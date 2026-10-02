-- Team workspaces for multi-tenant room booking.
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

insert into teams (id, name)
values ('e0000000-0000-0000-0000-000000000001', 'Selangor Properties')
on conflict (id) do nothing;

create table if not exists team_members (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

insert into team_members (team_id, user_id, role)
select 'e0000000-0000-0000-0000-000000000001', id, role from users
on conflict (team_id, user_id) do nothing;

alter table rooms add column if not exists team_id uuid references teams(id);
alter table bookings add column if not exists team_id uuid references teams(id);
alter table delegations add column if not exists team_id uuid references teams(id);
alter table audit_logs add column if not exists team_id uuid references teams(id);

update rooms set team_id = 'e0000000-0000-0000-0000-000000000001' where team_id is null;
update bookings set team_id = 'e0000000-0000-0000-0000-000000000001' where team_id is null;
update delegations set team_id = 'e0000000-0000-0000-0000-000000000001' where team_id is null;
update audit_logs set team_id = 'e0000000-0000-0000-0000-000000000001' where team_id is null;

alter table rooms alter column team_id set not null;
alter table bookings alter column team_id set not null;
alter table delegations alter column team_id set not null;
alter table audit_logs alter column team_id set not null;

create index if not exists rooms_team_active_idx on rooms (team_id, is_active);
create index if not exists bookings_team_start_idx on bookings (team_id, start_time);
create index if not exists delegations_team_idx on delegations (team_id, delegator_user_id, delegate_user_id);
create index if not exists audit_logs_team_created_idx on audit_logs (team_id, created_at desc);
drop index if exists delegations_user_pair_unique;
create unique index if not exists delegations_team_user_pair_unique on delegations (team_id, delegator_user_id, delegate_user_id);

alter table teams enable row level security;
alter table team_members enable row level security;
drop policy if exists "teams_v1_read" on teams;
create policy "teams_v1_read" on teams for select using (true);
drop policy if exists "teams_v1_write" on teams;
create policy "teams_v1_write" on teams for all using (true) with check (true);
drop policy if exists "team_members_v1_read" on team_members;
create policy "team_members_v1_read" on team_members for select using (true);
drop policy if exists "team_members_v1_write" on team_members;
create policy "team_members_v1_write" on team_members for all using (true) with check (true);
