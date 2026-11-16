-- Keep the selected flight's airport-local time zones and UTC timestamps with the leg.
alter table trip.travel_legs add column if not exists flight_snapshot jsonb
  check (flight_snapshot is null or (jsonb_typeof(flight_snapshot) = 'object' and octet_length(flight_snapshot::text) <= 6000));
notify pgrst, 'reload schema';
