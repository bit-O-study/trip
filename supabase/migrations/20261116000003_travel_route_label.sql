-- Optional service/route identifier, e.g. 88번 or 2호선. Existing legs remain intact.
alter table trip.travel_legs
  add column if not exists route_label text check (char_length(route_label) <= 100);

notify pgrst, 'reload schema';
