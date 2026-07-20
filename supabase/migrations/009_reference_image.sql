-- Reference image from Telegram photo messages (base64-encoded).
alter table public.tasks
  add column if not exists reference_image_base64 text;
