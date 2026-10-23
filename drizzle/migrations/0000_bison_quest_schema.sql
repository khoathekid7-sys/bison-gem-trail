create type public.app_role as enum ('organizer');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.claim_first_organizer()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  lock table public.user_roles in exclusive mode;
  if exists (select 1 from public.user_roles where role = 'organizer') then
    return public.has_role(auth.uid(), 'organizer');
  end if;
  insert into public.user_roles(user_id, role) values (auth.uid(), 'organizer');
  return true;
end $$;
revoke all on function public.claim_first_organizer() from public, anon;
grant execute on function public.claim_first_organizer() to authenticated;

create table public.stops (
  id text primary key,
  step int not null unique,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  radius_m double precision not null default 45,
  calibrated boolean not null default false,
  provenance text not null,
  calibrated_at timestamptz,
  calibrated_by uuid,
  landmark_description text not null
);
grant all on public.stops to service_role;
alter table public.stops enable row level security;

insert into public.stops (id, step, name, lat, lng, radius_m, calibrated, provenance, landmark_description) values
('elc', 1, 'ELC Uphill Patio', 40.956486, -76.884524, 45, false,
 'Official Bucknell map building pin for Elaine Langone Center (buildings_xml). Not a surveyed patio point; needs on-site patio calibration.',
 'The outdoor uphill entrance patio/plaza of the Elaine Langone Center (ELC) student center at Bucknell University: outdoor paved plaza with seating (benches/chairs/tables) and part of the ELC building entrance or facade visible. Must be outdoors. A person, specific chair arrangement, or sign is NOT required.'),
('carnegie', 2, 'Carnegie Building', 40.956180, -76.881780, 45, false,
 'Official Bucknell map building pin for Carnegie Building (buildings_xml). Not a surveyed entrance point.',
 'The exterior of the Carnegie Building at Bucknell University, opened 1905 as the campus library: entrance or distinctive facade with classical architectural detail, framed wide enough to recognize the building.');

create table public.reference_photos (
  id uuid primary key default gen_random_uuid(),
  stop_id text not null references public.stops(id),
  storage_path text not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
grant all on public.reference_photos to service_role;
alter table public.reference_photos enable row level security;

create table public.hunt_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  current_step int not null default 1,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  attempt_times timestamptz[] not null default '{}'
);
grant all on public.hunt_sessions to service_role;
alter table public.hunt_sessions enable row level security;

create table public.captures (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.hunt_sessions(id) on delete cascade,
  stop_id text not null references public.stops(id),
  client_capture_id text not null,
  storage_path text,
  status text not null check (status in ('accepted','rejected','error','pending_review','review_rejected')),
  location_passed boolean not null default false,
  photo_passed boolean not null default false,
  confidence double precision,
  reason text,
  retry_tip text,
  distance_m double precision,
  accuracy_m double precision,
  review_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, client_capture_id)
);
create unique index captures_one_accepted on public.captures(session_id, stop_id) where status = 'accepted';
grant all on public.captures to service_role;
alter table public.captures enable row level security;

create or replace function public.accept_capture(p_capture uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare c record; s record; st record; maxstep int;
begin
  select * into c from public.captures where id = p_capture for update;
  if c is null then return false; end if;
  select * into st from public.stops where id = c.stop_id;
  select * into s from public.hunt_sessions where id = c.session_id for update;
  if s.current_step <> st.step then return c.status = 'accepted'; end if;
  update public.captures set status = 'accepted' where id = p_capture;
  select max(step) into maxstep from public.stops;
  update public.hunt_sessions set current_step = st.step + 1,
    completed_at = case when st.step >= maxstep then now() else completed_at end
    where id = s.id;
  return true;
end $$;
revoke all on function public.accept_capture(uuid) from public, anon, authenticated;
grant execute on function public.accept_capture(uuid) to service_role;