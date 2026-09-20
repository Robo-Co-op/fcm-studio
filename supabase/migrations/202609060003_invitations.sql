-- 招待トークンは平文を保存せず、所有者向け RPC だけを公開する。
create table public.project_invitations (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 token_hash bytea not null unique,
 email text not null,
 role text not null check (role in ('editor','viewer')),
 expires_at timestamptz not null,
 consumed_at timestamptz,
 revoked_at timestamptz,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 check (length(email) between 3 and 320),
 check (email = lower(btrim(email)))
);
alter table public.project_invitations enable row level security;
revoke all on public.project_invitations from public, anon, authenticated;

create function public.create_project_invitation(p_project_id uuid, p_email text, p_role text)
returns table(id uuid, token text, email text, role text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
 normalized text := lower(btrim(p_email));
 raw_token text := gen_random_uuid()::text;
 result public.project_invitations;
begin
 if auth.uid() is null or not exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null)
 or public.project_role(p_project_id) is distinct from 'owner' then
  raise exception 'Project owner permission required';
 end if;
 if p_email is null or length(normalized) not between 3 and 320
 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 or p_role is null or p_role not in ('editor','viewer') then
  raise exception 'Invalid invitation';
 end if;
 perform pg_advisory_xact_lock(61432001);
 if (select count(*) from public.project_invitations i where i.project_id=p_project_id and i.consumed_at is null and i.revoked_at is null and i.expires_at>now())>=50
 or (select count(*) from public.project_invitations i where i.project_id=p_project_id)>=1000
 or (select count(*) from public.project_invitations i where i.created_by=auth.uid() and i.created_at>now()-interval '1 day')>=100
 then raise exception 'Invitation quota reached'; end if;
 insert into public.project_invitations(project_id,token_hash,email,role,expires_at,created_by)
 values(p_project_id,sha256(convert_to(raw_token,'UTF8')),normalized,p_role,now()+interval '7 days',auth.uid())
 returning * into result;
 return query select result.id,raw_token,result.email,result.role,result.expires_at;
end $$;
revoke all on function public.create_project_invitation(uuid,text,text) from public;
grant execute on function public.create_project_invitation(uuid,text,text) to authenticated;

create function public.accept_project_invitation(p_token text)
returns public.project_members language plpgsql security definer set search_path = '' as $$
declare
 invitation public.project_invitations;
 member public.project_members;
 authenticated_email text;
begin
 if auth.uid() is null then raise exception 'Verified authentication required'; end if;
 select lower(btrim(u.email)) into authenticated_email
 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null;
 if authenticated_email is null then raise exception 'Verified authentication required'; end if;
 if p_token is null or p_token !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
  raise exception 'Invitation is invalid or unavailable';
 end if;
 select i.* into invitation from public.project_invitations i
 where i.token_hash=sha256(convert_to(p_token,'UTF8')) for update;
 if not found or invitation.email is distinct from authenticated_email
 or invitation.expires_at<=now() or invitation.revoked_at is not null or invitation.consumed_at is not null then
  raise exception 'Invitation is invalid or unavailable';
 end if;
 -- 無効なトークンで共通保存枠を占有させず、有効な受諾の人数判定だけを直列化する。
 perform pg_advisory_xact_lock(61432001);
 if not exists(select 1 from public.project_members m where m.project_id=invitation.project_id and m.user_id=auth.uid())
 and (select count(*) from public.project_members m where m.project_id=invitation.project_id)>=100
 then raise exception 'Project member quota reached'; end if;
 insert into public.project_members(project_id,user_id,role)
 values(invitation.project_id,auth.uid(),invitation.role)
 on conflict(project_id,user_id) do update set role=
  case when public.project_members.role in ('owner','editor') then public.project_members.role else excluded.role end
 returning * into member;
 update public.project_invitations set consumed_at=now() where id=invitation.id;
 return member;
end $$;
revoke all on function public.accept_project_invitation(text) from public;
grant execute on function public.accept_project_invitation(text) to authenticated;

create function public.list_project_invitations(p_project_id uuid)
returns table(id uuid, email text, role text, expires_at timestamptz, consumed_at timestamptz, revoked_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null or not exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null)
 or public.project_role(p_project_id) is distinct from 'owner' then
  raise exception 'Project owner permission required';
 end if;
 return query select i.id,i.email,i.role,i.expires_at,i.consumed_at,i.revoked_at,i.created_at
 from public.project_invitations i where i.project_id=p_project_id order by i.created_at desc,i.id;
end $$;
revoke all on function public.list_project_invitations(uuid) from public;
grant execute on function public.list_project_invitations(uuid) to authenticated;

create function public.revoke_project_invitation(p_project_id uuid, p_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null)
 or public.project_role(p_project_id) is distinct from 'owner' then
  raise exception 'Project owner permission required';
 end if;
 update public.project_invitations set revoked_at=now()
 where id=p_invitation_id and project_id=p_project_id and revoked_at is null and consumed_at is null;
 if not found then raise exception 'Invitation is invalid or unavailable'; end if;
end $$;
revoke all on function public.revoke_project_invitation(uuid,uuid) from public;
grant execute on function public.revoke_project_invitation(uuid,uuid) to authenticated;

create function public.list_project_members(p_project_id uuid)
returns table(user_id uuid, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null or not exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null)
 or public.project_role(p_project_id) is distinct from 'owner' then
  raise exception 'Project owner permission required';
 end if;
 return query select m.user_id,m.role from public.project_members m
 where m.project_id=p_project_id order by m.role,m.user_id;
end $$;
revoke all on function public.list_project_members(uuid) from public;
grant execute on function public.list_project_members(uuid) to authenticated;

create function public.update_project_member_role(p_project_id uuid, p_user_id uuid, p_role text)
returns public.project_members language plpgsql security definer set search_path = '' as $$
declare result public.project_members;
begin
 if auth.uid() is null or not exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null)
 or public.project_role(p_project_id) is distinct from 'owner' then
  raise exception 'Project owner permission required';
 end if;
 if p_role is null or p_role not in ('editor','viewer') then raise exception 'Invalid member role'; end if;
 update public.project_members set role=p_role where project_id=p_project_id and user_id=p_user_id and role<>'owner'
 returning * into result;
 if not found then raise exception 'Member cannot be changed'; end if;
 return result;
end $$;
revoke all on function public.update_project_member_role(uuid,uuid,text) from public;
grant execute on function public.update_project_member_role(uuid,uuid,text) to authenticated;

create function public.remove_project_member(p_project_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null)
 or public.project_role(p_project_id) is distinct from 'owner' then
  raise exception 'Project owner permission required';
 end if;
 delete from public.project_members where project_id=p_project_id and user_id=p_user_id and role<>'owner';
 if not found then raise exception 'Member cannot be removed'; end if;
end $$;
revoke all on function public.remove_project_member(uuid,uuid) from public;
grant execute on function public.remove_project_member(uuid,uuid) to authenticated;
