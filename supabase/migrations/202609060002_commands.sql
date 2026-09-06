-- 再送識別専用の受領記録。研究スナップショットや認可情報は公開しない。
create table public.project_operations (
 project_id uuid not null references public.projects(id) on delete cascade,
 actor_id uuid not null references auth.users(id), operation_id uuid not null,
 expected_revision bigint not null, fingerprint text not null,
 created_at timestamptz not null default now(), primary key(project_id,actor_id,operation_id)
);
alter table public.project_operations enable row level security;
revoke all on public.project_operations from public,anon,authenticated;
-- 全作成・更新は共通の保存枠ロック順序を使う。
create function public.apply_project_command(p_project_id uuid,p_operation_id uuid,p_expected_revision bigint,p_command jsonb)
returns public.projects language plpgsql security definer set search_path = '' as $$
declare result public.projects; next_document jsonb; receipt public.project_operations; command_fingerprint text;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Verified authentication required'; end if;
 perform pg_advisory_xact_lock(61432001);
 select * into result from public.projects where id=p_project_id for update;
 if not found or coalesce(public.project_role(p_project_id),'') not in ('owner','editor') then raise exception 'Project edit permission denied'; end if;

 if p_operation_id is null or p_expected_revision is null then raise exception 'Invalid operation'; end if;
 if jsonb_typeof(p_command) is distinct from 'object' then raise exception 'Invalid command'; end if;
 if p_command->>'type'='replace_model' then
  if p_command - array['type','model'] <> '{}'::jsonb or not (p_command ? 'model') then raise exception 'Invalid command'; end if;
 elsif p_command->>'type'='set_details' then
  if p_command - array['type','name','agenda'] <> '{}'::jsonb or not public.fcm_text(p_command->'name',16000) or not public.fcm_text(p_command->'agenda',16000,false) then raise exception 'Invalid command'; end if;
 else raise exception 'Invalid command'; end if;
 command_fingerprint:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 select * into receipt from public.project_operations where project_id=p_project_id and actor_id=auth.uid() and operation_id=p_operation_id;
 if found then
  if receipt.expected_revision is distinct from p_expected_revision or receipt.fingerprint is distinct from command_fingerprint then raise exception 'Operation ID reused with different command'; end if;
  return result;
 end if;
 if p_expected_revision is distinct from result.revision then raise exception using errcode='40001',message='Project revision conflict',detail=jsonb_build_object('expected_revision',p_expected_revision,'actual_revision',result.revision)::text; end if;
 if p_command->>'type'='replace_model' then
 next_document:=jsonb_set(result.document,'{model}',p_command->'model');
 else
 next_document:=jsonb_set(jsonb_set(result.document,'{name}',p_command->'name'),'{agenda}',p_command->'agenda');
 end if;

 next_document:=jsonb_set(next_document,'{revision}',to_jsonb(result.revision+1));
 perform public.validate_fcm_document(next_document);
 if (select coalesce(sum(octet_length(document::text)),0) from public.projects where created_by=result.created_by and id<>p_project_id) + octet_length(next_document::text) > 20971520
 or (select coalesce(sum(octet_length(document::text)),0) from public.projects where id<>p_project_id) + octet_length(next_document::text) > 104857600
 then raise exception 'Project storage quota reached'; end if;
 if (select count(*) from public.project_operations where project_id=p_project_id)>=10000 then raise exception 'Operation quota reached'; end if;
 insert into public.project_operations(project_id,actor_id,operation_id,expected_revision,fingerprint) values(p_project_id,auth.uid(),p_operation_id,p_expected_revision,command_fingerprint);
 update public.projects set document=next_document,name=next_document->>'name',agenda=next_document->>'agenda',revision=revision+1,updated_at=now() where id=p_project_id returning * into result;
 return result;
end $$;
revoke all on function public.apply_project_command(uuid,uuid,bigint,jsonb) from public;
grant execute on function public.apply_project_command(uuid,uuid,bigint,jsonb) to authenticated;

-- Supabaseホストでは、RLSを通過したproject更新だけをRealtimeへ公開する。
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
 and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='projects')
 then execute 'alter publication supabase_realtime add table public.projects'; end if;
end $$;





