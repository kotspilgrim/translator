-- Daily server-side quota for the "Сгенерировать" (AI scenario-prompt
-- generation) button — must survive app restarts and not be resettable by
-- cancelling the create-scenario sheet, so it lives on the user's row rather
-- than in client-side state.
alter table users
  add column if not exists prompt_generate_count int not null default 0,
  add column if not exists prompt_generate_date date;
