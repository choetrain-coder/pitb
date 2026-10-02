-- Link already existing, verified Supabase accounts and handle profiles added
-- after a person has previously signed in.
create or replace function public.link_staff_profile_to_existing_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_user uuid;
begin
  if new.user_id is null then
    select a.id into linked_user
      from auth.users a
     where lower(a.email) = lower(new.email)
       and a.email_confirmed_at is not null
     limit 1;
    new.user_id := linked_user;
  end if;
  return new;
end;
$$;

drop trigger if exists link_staff_profile_to_existing_auth_user on public.users;
create trigger link_staff_profile_to_existing_auth_user
before insert or update of email on public.users
for each row execute function public.link_staff_profile_to_existing_auth_user();

update public.users u
   set user_id = a.id
  from auth.users a
 where u.user_id is null
   and lower(u.email) = lower(a.email)
   and a.email_confirmed_at is not null;
