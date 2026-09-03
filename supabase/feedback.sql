create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('bug', 'suggestion', 'feedback')),
  message text not null check (char_length(trim(message)) between 1 and 5000),
  theme text not null,
  language text not null,
  app_version text not null,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

grant insert on table public.feedback to anon, authenticated;

drop policy if exists "Allow anonymous feedback inserts" on public.feedback;
create policy "Allow anonymous feedback inserts"
  on public.feedback
  for insert
  to anon, authenticated
  with check (
    type in ('bug', 'suggestion', 'feedback')
    and char_length(trim(message)) between 1 and 5000
  );
