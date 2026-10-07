-- Keep existing IDs, records, revisions and memberships intact.
-- SQLite also updates foreign keys, indexes and triggers during these renames.
ALTER TABLE households RENAME TO spaces;
ALTER TABLE household_members RENAME TO space_members;
ALTER TABLE space_members RENAME COLUMN household_id TO space_id;
ALTER TABLE mutation_receipts RENAME COLUMN household_id TO space_id;
ALTER TABLE products RENAME COLUMN household_id TO space_id;
ALTER TABLE units RENAME COLUMN household_id TO space_id;
ALTER TABLE purchases RENAME COLUMN household_id TO space_id;
ALTER TABLE lots RENAME COLUMN household_id TO space_id;
ALTER TABLE cookings RENAME COLUMN household_id TO space_id;
ALTER TABLE batches RENAME COLUMN household_id TO space_id;
ALTER TABLE meals RENAME COLUMN household_id TO space_id;
ALTER TABLE usages RENAME COLUMN household_id TO space_id;
ALTER TABLE portions RENAME COLUMN household_id TO space_id;
ALTER TABLE allocations RENAME COLUMN household_id TO space_id;
ALTER TABLE adjustments RENAME COLUMN household_id TO space_id;
ALTER TABLE discards RENAME COLUMN household_id TO space_id;
DROP INDEX household_members_user;
CREATE INDEX space_members_user ON space_members(user_id);
