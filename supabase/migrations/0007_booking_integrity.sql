-- Enforce booking integrity for direct authenticated database requests too.
create unique index if not exists rooms_id_team_unique on public.rooms (id, team_id);
alter table public.bookings
  add constraint bookings_room_team_fk foreign key (room_id, team_id)
  references public.rooms (id, team_id);
alter table public.bookings
  add constraint bookings_half_hour_range_check check (
    start_time < end_time
    and end_time - start_time >= interval '30 minutes'
    and extract(minute from start_time) in (0, 30)
    and extract(minute from end_time) in (0, 30)
    and extract(second from start_time) = 0
    and extract(second from end_time) = 0
  );

drop policy if exists bookings_self_add on public.bookings;
create policy bookings_self_add on public.bookings for insert to authenticated
  with check (public.is_team_member(team_id)
    and booked_by_user_id = public.current_staff_id()
    and exists (select 1 from public.rooms r where r.id = bookings.room_id and r.team_id = bookings.team_id and r.is_active));

drop policy if exists bookings_owner_delegate_admin_update on public.bookings;
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
      and d.delegate_user_id = public.current_staff_id() and d.is_active
  ) and exists (select 1 from public.rooms r where r.id = bookings.room_id and r.team_id = bookings.team_id and r.is_active)
  ));
