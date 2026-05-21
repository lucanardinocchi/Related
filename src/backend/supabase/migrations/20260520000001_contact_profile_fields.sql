-- ADR-0008: web becomes the primary surface. The Relationship detail page
-- displays a rich Contact profile up-front; previously contacts carried only
-- name/phone/email, which the Notion-style Key Details panel can't fill.
-- All new fields are nullable and User-curated — none are required, none are
-- canonicalised. Birthday is a date (no time component, no year required to
-- be in the past). Area is intentionally free-text (e.g. 'Surry Hills',
-- 'Inner West') rather than a normalised location — the User writes whatever
-- they think of the person's neighbourhood. Occupation and education are
-- short free-text labels for the same reason.
alter table public.contacts
  add column birthday date,
  add column area text,
  add column occupation text,
  add column education text;
