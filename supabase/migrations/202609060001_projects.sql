-- portable v1 と同じ境界検証。NULLは必ず不正として扱う。
-- ECMAScript trim の空白集合と UTF-16 単位数を使用する。
create function public.fcm_trim(v text) returns text language sql immutable set search_path = '' as $$
 select btrim(v,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
$$;
create function public.fcm_text(v jsonb, max_length integer, nonempty boolean default true) returns boolean language sql immutable set search_path = '' as $$
 select coalesce(jsonb_typeof(v)='string' and length(v#>>'{}')+length(regexp_replace(v#>>'{}',U&'[\0001-\FFFF]','','g'))<=max_length and (not nonempty or length(public.fcm_trim(v#>>'{}'))>0),false)
$$;
create function public.fcm_id(v jsonb) returns boolean language sql immutable set search_path = '' as $$
 select public.fcm_text(v,120) and (v#>>'{}') not in ('__proto__','constructor','toString','toLocaleString','valueOf','hasOwnProperty','isPrototypeOf','propertyIsEnumerable','__defineGetter__','__defineSetter__','__lookupGetter__','__lookupSetter__')
$$;
create function public.fcm_number(v jsonb, lo numeric, hi numeric, integral boolean default false) returns boolean language plpgsql immutable set search_path = '' as $$
declare n numeric;
begin
 if jsonb_typeof(v) is distinct from 'number' then return false; end if;
 n := (v#>>'{}')::numeric;
 return n between lo and hi and (not integral or trunc(n)=n);
end $$;
create function public.validate_fcm_model(m jsonb) returns void language plpgsql immutable set search_path = '' as $$
declare f jsonb; e jsonb; ids text[] := '{}'; labels text[] := '{}';
begin
 if jsonb_typeof(m) is distinct from 'object' or jsonb_typeof(m->'factors') is distinct from 'array' or jsonb_typeof(m->'relationships') is distinct from 'array' then raise exception 'Invalid model'; end if;
 if jsonb_array_length(m->'factors')>200 or jsonb_array_length(m->'relationships')>40000 then raise exception 'Invalid model size'; end if;
 for f in select value from jsonb_array_elements(m->'factors') loop
  if not public.fcm_id(f->'id') or not public.fcm_text(f->'label',300) or (f ? 'description' and not public.fcm_text(f->'description',4000,false)) or coalesce((f->>'color') ~ '^#[0-9a-fA-F]{6}$',false)=false or not public.fcm_number(f->'x',-1.7976931348623157e308,1.7976931348623157e308) or not public.fcm_number(f->'y',-1.7976931348623157e308,1.7976931348623157e308) or coalesce(f->>'provenance','') not in ('human','imported','ai') then raise exception 'Invalid factor'; end if;
  if f->>'id'=any(ids) or translate(public.fcm_trim(f->>'label'),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')=any(labels) then raise exception 'Duplicate factor'; end if;
  ids := array_append(ids,f->>'id'); labels := array_append(labels,translate(public.fcm_trim(f->>'label'),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'));
 end loop;
 if exists(select 1 from jsonb_array_elements(m->'relationships') edge group by edge->'source',edge->'target' having count(*)>1) then raise exception 'Duplicate relationship'; end if;
 for e in select value from jsonb_array_elements(m->'relationships') loop
  if not public.fcm_id(e->'source') or not public.fcm_id(e->'target') or not coalesce(e->>'source'=any(ids),false) or not coalesce(e->>'target'=any(ids),false) or not public.fcm_number(e->'weight',-1,1) or e->'weight'='0'::jsonb or coalesce(e->>'provenance','') not in ('human','imported','ai') or (e ? 'rationale' and not public.fcm_text(e->'rationale',4000,false)) then raise exception 'Invalid relationship'; end if;
 end loop;
end $$;
create function public.validate_fcm_activations(v jsonb,m jsonb) returns void language plpgsql immutable set search_path = '' as $$
declare entry record;
begin
 if jsonb_typeof(v) is distinct from 'object' then raise exception 'Invalid activations'; end if;
 for entry in select key,value from jsonb_each(v) loop
  if not public.fcm_number(entry.value,0,1) or not exists(select 1 from jsonb_array_elements(m->'factors') f where f->>'id'=entry.key) then raise exception 'Invalid activation'; end if;
 end loop;
end $$;
create function public.validate_fcm_document(d jsonb) returns void language plpgsql immutable set search_path = '' as $$
declare s jsonb; r jsonb; result jsonb; settings jsonb; state jsonb; activation jsonb; ids text[]; expected_ids jsonb;
begin
 if octet_length(d::text)>10485760 then raise exception 'Project exceeds 10 MiB'; end if;
 if jsonb_typeof(d) is distinct from 'object' or d->'version' is distinct from '1'::jsonb or not public.fcm_id(d->'id') or not public.fcm_text(d->'name',16000) or not public.fcm_text(d->'agenda',16000,false) or not public.fcm_number(d->'revision',0,9007199254740991,true) or jsonb_typeof(d->'scenarios') is distinct from 'array' or jsonb_typeof(d->'runs') is distinct from 'array' then raise exception 'Invalid project'; end if;
 if jsonb_array_length(d->'scenarios')>100 or jsonb_array_length(d->'runs')>100 then raise exception 'Invalid project size'; end if;
 perform public.validate_fcm_model(d->'model'); perform public.validate_fcm_model(d->'baseline');
 ids := '{}';
 for s in select value from jsonb_array_elements(d->'scenarios') loop
  if not public.fcm_id(s->'id') or not public.fcm_text(s->'name',300) or s->>'id'=any(ids) then raise exception 'Invalid scenario'; end if;
  ids:=array_append(ids,s->>'id');
  perform public.validate_fcm_model(s->'model'); perform public.validate_fcm_activations(s->'initial',s->'model'); perform public.validate_fcm_activations(s->'clamped',s->'model');
 end loop;
 ids := '{}';
 for r in select value from jsonb_array_elements(d->'runs') loop
  if not public.fcm_id(r->'id') or r->>'id'=any(ids) or not public.fcm_text(r->'createdAt',100) then raise exception 'Invalid run'; end if;
  if (r->>'createdAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' then raise exception 'Invalid run date'; end if;
  if to_char((r->>'createdAt')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> r->>'createdAt' then raise exception 'Invalid run date'; end if;
  ids:=array_append(ids,r->>'id');
  perform public.validate_fcm_model(r->'snapshot'); perform public.validate_fcm_activations(r->'initial',r->'snapshot'); perform public.validate_fcm_activations(r->'clamped',r->'snapshot');
  result:=r->'result'; settings:=result->'settings';
  if result->>'algorithm' is distinct from 'modified-kosko-sigmoid-v1' or jsonb_typeof(result->'converged') is distinct from 'boolean' or not public.fcm_number(result->'iterations',1,10000,true) or not public.fcm_number(settings->'slope',0,100) or settings->'slope'='0'::jsonb or not public.fcm_number(settings->'tolerance',0,1) or settings->'tolerance'='0'::jsonb or not public.fcm_number(settings->'stableSteps',1,10000,true) or not public.fcm_number(settings->'maxIterations',1,10000,true) then raise exception 'Invalid simulation settings'; end if;
  if (result->>'iterations')::integer>(settings->>'maxIterations')::integer then raise exception 'Invalid iteration limit'; end if;
  select coalesce(jsonb_agg(f->'id' order by n),'[]') into expected_ids from jsonb_array_elements(r->'snapshot'->'factors') with ordinality as t(f,n);
  if expected_ids='[]'::jsonb or result->'factorIds' is distinct from expected_ids or jsonb_typeof(result->'states') is distinct from 'array' then raise exception 'Invalid run factors'; end if;
  if jsonb_array_length(result->'states')<>(result->>'iterations')::integer+1 then raise exception 'Invalid trajectory length'; end if;
  for state in select value from jsonb_array_elements(result->'states') loop
   if jsonb_typeof(state) is distinct from 'array' then raise exception 'Invalid trajectory'; end if;
   if jsonb_array_length(state)<>jsonb_array_length(expected_ids) then raise exception 'Invalid trajectory width'; end if;
   for activation in select value from jsonb_array_elements(state) loop
    if not public.fcm_number(activation,0,1) then raise exception 'Invalid trajectory value'; end if;
   end loop;
  end loop;
 end loop;
end $$;
revoke all on function public.fcm_trim(text), public.fcm_text(jsonb,integer,boolean), public.fcm_id(jsonb), public.fcm_number(jsonb,numeric,numeric,boolean), public.validate_fcm_model(jsonb), public.validate_fcm_activations(jsonb,jsonb), public.validate_fcm_document(jsonb) from public;
-- ブラウザには読取と原子的RPCだけを公開する。
create table public.projects (
 id uuid primary key default gen_random_uuid(), name text not null, agenda text not null,
 document jsonb not null, revision bigint not null default 0 check(revision >= 0),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.project_members (
 project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null references auth.users(id), role text not null check(role in ('owner','editor','viewer')),
 primary key(project_id,user_id)
);
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
create function public.project_role(p_project_id uuid) returns text language sql stable security definer set search_path = '' as $$
 select role from public.project_members where project_id=p_project_id and user_id=auth.uid()
$$;
revoke all on function public.project_role(uuid) from public;
grant execute on function public.project_role(uuid) to authenticated;
create policy project_read on public.projects for select to authenticated using (public.project_role(id) is not null);
create policy member_read on public.project_members for select to authenticated using (public.project_role(project_id) is not null);
revoke all on public.projects, public.project_members from anon, authenticated;
grant select on public.projects, public.project_members to authenticated;
create function public.create_project(p_document jsonb) returns public.projects language plpgsql security definer set search_path = '' as $$
declare result public.projects; project_id uuid := gen_random_uuid();
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Verified authentication required'; end if;
 perform public.validate_fcm_document(p_document);
 p_document := jsonb_set(jsonb_set(p_document,'{id}',to_jsonb(project_id)), '{revision}','0');
 -- 無料公開環境の初期保存枠。並行作成でも同じ予約枠を確認する。
 perform pg_advisory_xact_lock(61432001);
 if (select count(*) from public.projects where created_by=auth.uid()) >= 20
 or (select count(*) from public.projects) >= 200
 or (select coalesce(sum(octet_length(document::text)),0) from public.projects where created_by=auth.uid()) + octet_length(p_document::text) > 20971520
 or (select coalesce(sum(octet_length(document::text)),0) from public.projects) + octet_length(p_document::text) > 104857600
 then raise exception 'Project storage quota reached'; end if;
 insert into public.projects(id,name,agenda,document,created_by) values(project_id,p_document->>'name',p_document->>'agenda',p_document,auth.uid()) returning * into result;
 insert into public.project_members values(project_id,auth.uid(),'owner');
 return result;
end $$;
revoke all on function public.create_project(jsonb) from public;
grant execute on function public.create_project(jsonb) to authenticated;



