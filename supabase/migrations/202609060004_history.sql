-- 研究履歴は追記専用。共有project文書の上限100件とは独立して保存する。
create table public.project_baselines (
 project_id uuid primary key references public.projects(id) on delete cascade,
 model jsonb not null, actor_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.project_scenarios (
 project_id uuid not null references public.projects(id) on delete cascade, id text not null,
 name text not null, model jsonb not null, initial jsonb not null, clamped jsonb not null,
 project_revision bigint not null, actor_id uuid not null references auth.users(id), created_at timestamptz not null default now(),
 primary key(project_id,id)
);
create table public.project_runs (
 project_id uuid not null references public.projects(id) on delete cascade, id text not null,
 run jsonb not null, project_revision bigint not null, actor_id uuid not null references auth.users(id), created_at timestamptz not null default now(),
 primary key(project_id,id)
);
alter table public.project_baselines enable row level security;
alter table public.project_scenarios enable row level security;
alter table public.project_runs enable row level security;
create policy baseline_read on public.project_baselines for select to authenticated using(public.project_role(project_id) is not null);
create policy scenario_read on public.project_scenarios for select to authenticated using(public.project_role(project_id) is not null);
create policy run_read on public.project_runs for select to authenticated using(public.project_role(project_id) is not null);
revoke all on public.project_baselines,public.project_scenarios,public.project_runs from public,anon,authenticated;
grant select on public.project_baselines,public.project_scenarios,public.project_runs to authenticated;

-- 履歴の使用量を同じ保存枠ロック下で集計し、無料DB全体の枯渇を防ぐ。
create function public.fcm_history_bytes(p_project_id uuid default null,p_created_by uuid default null)
returns bigint language sql stable security definer set search_path='' as $$
 select coalesce(sum(h.bytes),0)::bigint from (
  select b.project_id,octet_length(b.model::text)::bigint as bytes from public.project_baselines b
  union all
  select s.project_id,octet_length(jsonb_build_object('id',s.id,'name',s.name,'model',s.model,'initial',s.initial,'clamped',s.clamped)::text)::bigint from public.project_scenarios s
  union all
  select r.project_id,octet_length(r.run::text)::bigint from public.project_runs r
 ) h join public.projects p on p.id=h.project_id
 where (p_project_id is null or h.project_id=p_project_id)
 and (p_created_by is null or p.created_by=p_created_by)
$$;
revoke all on function public.fcm_history_bytes(uuid,uuid) from public,anon,authenticated;

create function public.save_project_baseline(p_project_id uuid,p_model jsonb) returns public.project_baselines language plpgsql security definer set search_path='' as $$
declare project public.projects; result public.project_baselines; record_bytes bigint;
begin
 perform pg_advisory_xact_lock(61432001);
 select * into project from public.projects where id=p_project_id for update;
 if not found or auth.uid() is null or not exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null)
 or coalesce(public.project_role(p_project_id),'') not in('owner','editor') then raise exception 'Project edit permission denied'; end if;
 perform public.validate_fcm_model(p_model);
 if p_model is distinct from project.document->'model' then raise exception 'Baseline must match the current project model'; end if;
 record_bytes:=octet_length(p_model::text);
 if public.fcm_history_bytes(p_project_id,null)+record_bytes>20971520
 or public.fcm_history_bytes(null,project.created_by)+record_bytes>52428800
 or public.fcm_history_bytes(null,null)+record_bytes>104857600 then raise exception 'Research history storage quota reached'; end if;
 insert into public.project_baselines(project_id,model,actor_id) values(p_project_id,p_model,auth.uid()) returning * into result;
 return result;
end $$;
create function public.save_project_scenario(p_project_id uuid,p_scenario jsonb,p_expected_revision bigint) returns public.project_scenarios language plpgsql security definer set search_path='' as $$
declare project public.projects; result public.project_scenarios; record_bytes bigint;
begin
 perform pg_advisory_xact_lock(61432001);
 select * into project from public.projects where id=p_project_id for update;
 if not found or auth.uid() is null or not exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null)
 or coalesce(public.project_role(p_project_id),'') not in('owner','editor') then raise exception 'Project edit permission denied'; end if;
 if project.revision is distinct from p_expected_revision then raise exception using errcode='40001',message='Project revision conflict'; end if;
 if (select count(*) from public.project_scenarios where project_id=p_project_id)>=100 then raise exception 'Scenario quota reached'; end if;
 perform public.validate_fcm_document(jsonb_set(jsonb_set(project.document,'{scenarios}',jsonb_build_array(p_scenario)),'{runs}','[]'::jsonb));
 if p_scenario->'model' is distinct from project.document->'model' then raise exception 'Scenario must match the current project model'; end if;
 record_bytes:=octet_length(p_scenario::text);
 if public.fcm_history_bytes(p_project_id,null)+record_bytes>20971520
 or public.fcm_history_bytes(null,project.created_by)+record_bytes>52428800
 or public.fcm_history_bytes(null,null)+record_bytes>104857600 then raise exception 'Research history storage quota reached'; end if;
 insert into public.project_scenarios(project_id,id,name,model,initial,clamped,project_revision,actor_id)
 values(p_project_id,p_scenario->>'id',p_scenario->>'name',p_scenario->'model',p_scenario->'initial',p_scenario->'clamped',project.revision,auth.uid()) returning * into result;
 return result;
end $$;
create function public.save_project_run(p_project_id uuid,p_run jsonb,p_expected_revision bigint) returns public.project_runs language plpgsql security definer set search_path='' as $$
declare project public.projects; result public.project_runs; record_bytes bigint;
begin
 perform pg_advisory_xact_lock(61432001);
 select * into project from public.projects where id=p_project_id for update;
 if not found or auth.uid() is null or not exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null)
 or coalesce(public.project_role(p_project_id),'') not in('owner','editor') then raise exception 'Project edit permission denied'; end if;
 if project.revision is distinct from p_expected_revision then raise exception using errcode='40001',message='Project revision conflict'; end if;
 if (select count(*) from public.project_runs where project_id=p_project_id)>=100 then raise exception 'Run quota reached'; end if;
 perform public.validate_fcm_document(jsonb_set(jsonb_set(project.document,'{runs}',jsonb_build_array(p_run)),'{scenarios}','[]'::jsonb));
 if p_run->'snapshot' is distinct from project.document->'model' then raise exception 'Run must match the current project model'; end if;
 record_bytes:=octet_length(p_run::text);
 if public.fcm_history_bytes(p_project_id,null)+record_bytes>20971520
 or public.fcm_history_bytes(null,project.created_by)+record_bytes>52428800
 or public.fcm_history_bytes(null,null)+record_bytes>104857600 then raise exception 'Research history storage quota reached'; end if;
 insert into public.project_runs(project_id,id,run,project_revision,actor_id) values(p_project_id,p_run->>'id',p_run,project.revision,auth.uid()) returning * into result;
 return result;
end $$;
revoke all on function public.save_project_baseline(uuid,jsonb),public.save_project_scenario(uuid,jsonb,bigint),public.save_project_run(uuid,jsonb,bigint) from public;
grant execute on function public.save_project_baseline(uuid,jsonb),public.save_project_scenario(uuid,jsonb,bigint),public.save_project_run(uuid,jsonb,bigint) to authenticated;

-- Supabase Realtimeが有効な環境では、共同研究者へ追記を即時反映する。
do $$
declare table_name text;
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach table_name in array array['project_baselines','project_scenarios','project_runs'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name) then
    execute format('alter publication supabase_realtime add table public.%I',table_name);
   end if;
  end loop;
 end if;
end $$;
