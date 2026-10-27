BEGIN;

UPDATE app.departments
SET name = regexp_replace(name, 'Outfiting', 'Outfitting', 'gi')
WHERE name ~* 'Outfiting';

UPDATE app.positions
SET title = regexp_replace(title, 'Outfiting', 'Outfitting', 'gi')
WHERE title ~* 'Outfiting';

COMMIT;
