-- Workspace creation follows membership roles, not the legacy global user role.
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
  if actor_id is null or not exists (
    select 1 from public.team_members m where m.user_id = actor_id and m.role = 'admin'
  ) then
    raise exception 'Only a team administrator can create a team workspace.' using errcode = '42501';
  end if;
  insert into public.teams (name, created_by_user_id) values (trim(team_name), actor_id) returning * into created;
  insert into public.team_members (team_id, user_id, role) values (created.id, actor_id, 'admin');
  return created;
end;
$$;
