-- Room Booking System — schema + seed data
-- Demo-first: open access via permissive RLS (lock-down sprint replaces these)
create extension if not exists btree_gist;

-- USERS
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text not null,
  role text not null default 'staff',
  user_id uuid,
  created_at timestamptz not null default now()
);
alter table users enable row level security;
drop policy if exists "users_v1_read" on users;
create policy "users_v1_read" on users for select using (true);
drop policy if exists "users_v1_write" on users;
create policy "users_v1_write" on users for all using (true) with check (true);

-- ROOMS
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  capacity int default 4,
  amenities text[] default '{}',
  is_active boolean not null default true,
  user_id uuid,
  created_at timestamptz not null default now()
);
alter table rooms enable row level security;
drop policy if exists "rooms_v1_read" on rooms;
create policy "rooms_v1_read" on rooms for select using (true);
drop policy if exists "rooms_v1_write" on rooms;
create policy "rooms_v1_write" on rooms for all using (true) with check (true);

-- BOOKINGS
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  booked_by_user_id uuid,
  title text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'confirmed',
  user_id uuid,
  created_at timestamptz not null default now(),
  constraint bookings_room_time_excl exclude using gist
    (room_id with =, tstzrange(start_time, end_time, '[)') with &&)
    where (status = 'confirmed')
);
alter table bookings enable row level security;
drop policy if exists "bookings_v1_read" on bookings;
create policy "bookings_v1_read" on bookings for select using (true);
drop policy if exists "bookings_v1_write" on bookings;
create policy "bookings_v1_write" on bookings for all using (true) with check (true);

-- DELEGATIONS
create table if not exists delegations (
  id uuid primary key default gen_random_uuid(),
  delegator_user_id uuid,
  delegate_user_id uuid,
  is_active boolean not null default true,
  user_id uuid,
  created_at timestamptz not null default now()
);
alter table delegations enable row level security;
create unique index if not exists delegations_user_pair_unique
  on delegations (delegator_user_id, delegate_user_id);
drop policy if exists "delegations_v1_read" on delegations;
create policy "delegations_v1_read" on delegations for select using (true);
drop policy if exists "delegations_v1_write" on delegations;
create policy "delegations_v1_write" on delegations for all using (true) with check (true);

-- AUDIT_LOGS
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid,
  action text not null,
  actor_user_id uuid,
  changes jsonb,
  user_id uuid,
  created_at timestamptz not null default now()
);
alter table audit_logs enable row level security;
drop policy if exists "audit_logs_v1_read" on audit_logs;
create policy "audit_logs_v1_read" on audit_logs for select using (true);
drop policy if exists "audit_logs_v1_write" on audit_logs;
create policy "audit_logs_v1_write" on audit_logs for all using (true) with check (true);

-- SEED: Users
insert into users (id, email, full_name, role) values
  ('a0000000-0000-0000-0000-000000000001', 'sarah.chen@company.com', 'Sarah Chen', 'admin'),
  ('a0000000-0000-0000-0000-000000000002', 'mike.rogers@company.com', 'Mike Rogers', 'staff'),
  ('a0000000-0000-0000-0000-000000000003', 'jane.laptop@company.com', 'Jane Laptop', 'staff'),
  ('a0000000-0000-0000-0000-000000000004', 'david.kim@company.com', 'David Kim', 'staff')
on conflict (email) do nothing;

-- SEED: Rooms
insert into rooms (id, name, location, capacity, amenities) values
  ('b0000000-0000-0000-0000-000000000001', 'Boardroom A', 'Floor 3', 12, '{"projector","whiteboard","video-call"}'),
  ('b0000000-0000-0000-0000-000000000002', 'Huddle B', 'Floor 2', 4, '{"whiteboard"}'),
  ('b0000000-0000-0000-0000-000000000003', 'Executive Suite', 'Floor 5', 20, '{"projector","video-call","catering"}'),
  ('b0000000-0000-0000-0000-000000000004', 'Training Room', 'Floor 1', 30, '{"projector","whiteboard"}')
on conflict (id) do nothing;

-- SEED: Bookings
insert into bookings (id, room_id, booked_by_user_id, title, start_time, end_time, status) values
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Quarterly Review', date_trunc('day', now()) + interval '1 day 2 hours', date_trunc('day', now()) + interval '1 day 3 hours', 'confirmed'),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'Daily Standup', date_trunc('day', now()) + interval '1 day 1 hour', date_trunc('day', now()) + interval '1 day 1 hour 30 minutes', 'confirmed'),
  ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Client Presentation', date_trunc('day', now()) + interval '2 days 6 hours', date_trunc('day', now()) + interval '2 days 7 hours 30 minutes', 'confirmed'),
  ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'Sprint Planning', date_trunc('day', now()) + interval '3 days 2 hours 30 minutes', date_trunc('day', now()) + interval '3 days 4 hours', 'confirmed'),
  ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'All-hands Prep', date_trunc('day', now()) + interval '3 days 7 hours', date_trunc('day', now()) + interval '3 days 8 hours', 'confirmed')
on conflict (id) do nothing;

-- SEED: Delegations
insert into delegations (delegator_user_id, delegate_user_id, is_active) values
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', true),
  ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', true)
on conflict (delegator_user_id, delegate_user_id) do nothing;
