-- AIの利用可否はブラウザではなく、認証済みprojectメンバーを検査するDBで予約する。
create table public.ai_proposal_requests (
 id uuid primary key,
 project_id uuid not null references public.projects(id) on delete cascade,
 actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 input_tokens integer,
 output_tokens integer,
 check (input_tokens is null or input_tokens between 0 and 20000),
 check (output_tokens is null or output_tokens between 0 and 4000)
);
alter table public.ai_proposal_requests enable row level security;
revoke all on public.ai_proposal_requests from public, anon, authenticated;

create function public.reserve_ai_proposal(p_project_id uuid,p_request_id uuid)
returns table(project_id uuid,revision bigint,document jsonb)
language plpgsql security definer set search_path='' as $$
declare result public.projects;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
  raise exception 'Verified authentication required';
 end if;
 if p_project_id is null or p_request_id is null then raise exception 'Invalid AI request'; end if;
 perform pg_advisory_xact_lock(61432001);
 select * into result from public.projects where id=p_project_id for update;
 if not found or coalesce(public.project_role(p_project_id),'') not in ('owner','editor') then raise exception 'Project edit permission denied'; end if;
 if octet_length(result.document::text)>204800 then raise exception 'Project is too large for an AI proposal'; end if;
 if exists(select 1 from public.ai_proposal_requests r where r.id=p_request_id and r.project_id=p_project_id and r.actor_id=auth.uid()) then
  return query select result.id,result.revision,result.document; return;
 end if;
 if exists(select 1 from public.ai_proposal_requests r where r.id=p_request_id) then raise exception 'Invalid AI request'; end if;
 if (select count(*) from public.ai_proposal_requests r where r.actor_id=auth.uid() and r.created_at>now()-interval '1 day')>=100
 or (select count(*) from public.ai_proposal_requests r where r.project_id=p_project_id and r.created_at>now()-interval '1 hour')>=30 then
  raise exception 'AI proposal quota reached';
 end if;
 insert into public.ai_proposal_requests(id,project_id,actor_id) values(p_request_id,p_project_id,auth.uid());
 return query select result.id,result.revision,result.document;
end $$;
revoke all on function public.reserve_ai_proposal(uuid,uuid) from public;
grant execute on function public.reserve_ai_proposal(uuid,uuid) to authenticated;

create function public.complete_ai_proposal(p_request_id uuid,p_input_tokens integer,p_output_tokens integer)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_request_id is null or p_input_tokens not between 0 and 20000 or p_output_tokens not between 0 and 4000 then raise exception 'Invalid AI usage'; end if;
 update public.ai_proposal_requests set completed_at=now(),input_tokens=p_input_tokens,output_tokens=p_output_tokens
 where id=p_request_id and actor_id=auth.uid() and completed_at is null;
 if not found then raise exception 'AI request unavailable'; end if;
end $$;
revoke all on function public.complete_ai_proposal(uuid,integer,integer) from public;
grant execute on function public.complete_ai_proposal(uuid,integer,integer) to authenticated;
