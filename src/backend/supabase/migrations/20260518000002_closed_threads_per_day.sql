-- closed_threads_per_day: returns a zero-filled (day, count) row per UTC day
-- in [p_from, p_to] for the calling User. The Home graph card calls this for
-- 60 days back, then computes the total + prior-30 delta + sparkline on the
-- client. UTC buckets in v1; multi-timezone awareness deferred.
create function public.closed_threads_per_day(
  p_from date,
  p_to date
) returns table (day date, count integer)
language sql
stable
as $$
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as day
  ),
  closures as (
    select (closed_at at time zone 'UTC')::date as day, count(*)::int as count
    from public.open_threads
    where owner_id = auth.uid()
      and closed_at is not null
      and (closed_at at time zone 'UTC')::date between p_from and p_to
    group by 1
  )
  select days.day, coalesce(closures.count, 0)::int as count
  from days
  left join closures on closures.day = days.day
  order by days.day;
$$;
