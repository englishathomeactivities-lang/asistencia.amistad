alter table public.attendance
  alter column period drop not null;

alter table public.attendance
  add column if not exists class_id text not null default 'general';

alter table public.attendance
  drop constraint if exists attendance_student_id_subject_date_key;

alter table public.attendance
  drop constraint if exists attendance_student_subject_date_class_key;

alter table public.attendance
  add constraint attendance_student_subject_date_class_key
  unique (student_id, subject, date, class_id);

alter table public.attendance
  drop constraint if exists attendance_status_check;

alter table public.attendance
  add constraint attendance_status_check
  check (status in ('A', 'F', 'E', 'R', 'N', 'J'));

create table if not exists public.school_year_settings (
  year integer primary key,
  periods jsonb not null default '[]'::jsonb,
  schedule jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.school_year_settings enable row level security;

drop policy if exists "Teachers can manage school year settings"
  on public.school_year_settings;

create policy "Teachers can manage school year settings"
  on public.school_year_settings for all to authenticated
  using ((select public.is_teacher()))
  with check ((select public.is_teacher()));

grant select, insert, update, delete on public.school_year_settings to authenticated;
