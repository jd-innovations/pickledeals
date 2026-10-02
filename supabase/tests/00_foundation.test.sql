begin;
select plan(3);

select has_extension('postgis', 'PostGIS is installed for approximate listing locations');
select has_extension('pg_trgm', 'pg_trgm is installed for fuzzy search');
select has_function('public', 'set_updated_at', 'updated_at trigger function exists');

select * from finish();
rollback;
