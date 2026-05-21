-- Contact area stays the User-facing suburb label (e.g. 'Surry Hills, NSW').
-- Latitude/longitude are set together when the User picks a suburb so the
-- relationships index can filter by centre point + radius later.
alter table public.contacts
  add column latitude double precision,
  add column longitude double precision;

create index contacts_location_coords_idx
  on public.contacts (latitude, longitude)
  where latitude is not null and longitude is not null;
