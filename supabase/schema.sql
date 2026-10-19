create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('teacher'))
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  grade text not null check (grade in ('6°', '7°', '8°', '9°', '10°', '11°')),
  year integer not null,
  created_at timestamptz not null default now()
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  subject text not null check (subject in ('Informática', 'Ética', 'Inglés', 'Proyecto Lector')),
  date date not null,
  year integer not null,
  period integer not null check (period between 1 and 4),
  status text not null check (status in ('A', 'E', 'R', 'N', 'J')),
  created_at timestamptz not null default now(),
  unique (student_id, subject, date)
);

create index students_year_grade_idx on public.students (year, grade);
create index attendance_year_subject_date_idx on public.attendance (year, subject, date);
create index attendance_student_id_idx on public.attendance (student_id);

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'teacher'
      and lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'englishathomeactivities@gmail.com'
  );
$$;

revoke all on function public.is_teacher() from public;
grant execute on function public.is_teacher() to authenticated;

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.attendance enable row level security;

create policy "Teachers can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Teachers can manage students"
  on public.students for all to authenticated
  using ((select public.is_teacher()))
  with check ((select public.is_teacher()));

create policy "Teachers can manage attendance"
  on public.attendance for all to authenticated
  using ((select public.is_teacher()))
  with check ((select public.is_teacher()));

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update, delete on public.attendance to authenticated;
