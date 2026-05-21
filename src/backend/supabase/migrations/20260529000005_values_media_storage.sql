-- Public bucket for muxed Values swipe clips (generated offline).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'values-media',
  'values-media',
  true,
  52428800,
  array['video/mp4']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public read values media"
on storage.objects
for select
to public
using (bucket_id = 'values-media');
