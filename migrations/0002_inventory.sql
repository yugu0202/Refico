CREATE TABLE households (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES user(id),
  name TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0)
);
CREATE TABLE household_members (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner', 'member')),
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(household_id, user_id)
);
CREATE INDEX household_members_user ON household_members(user_id);
CREATE TABLE mutation_receipts (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id),
  expected_revision INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(household_id, request_id)
);
CREATE TRIGGER mutation_revision_guard BEFORE INSERT ON mutation_receipts BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM households WHERE id = NEW.household_id AND revision = NEW.expected_revision
  ) THEN RAISE(ABORT, 'revision_conflict') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM household_members WHERE household_id = NEW.household_id AND user_id = NEW.user_id
  ) THEN RAISE(ABORT, 'membership_required') END;
END;
CREATE TRIGGER mutation_revision_advance AFTER INSERT ON mutation_receipts BEGIN
  UPDATE households SET revision = revision + 1 WHERE id = NEW.household_id;
END;
CREATE TABLE products (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data) AND json_extract(data, '$.id') = id),
  PRIMARY KEY(household_id, id)
);
CREATE TABLE units (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data) AND json_extract(data, '$.id') = id),
  product_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.productId')) STORED,
  PRIMARY KEY(household_id, id),
  FOREIGN KEY(household_id, product_id) REFERENCES products(household_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX units_product_id ON units(household_id, product_id);
CREATE TABLE purchases (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data) AND json_extract(data, '$.id') = id),
  product_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.productId')) STORED,
  lot_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.lotId')) STORED,
  PRIMARY KEY(household_id, id),
  FOREIGN KEY(household_id, product_id) REFERENCES products(household_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(household_id, lot_id) REFERENCES lots(household_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX purchases_product_id ON purchases(household_id, product_id);
CREATE INDEX purchases_lot_id ON purchases(household_id, lot_id);
CREATE TABLE lots (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data) AND json_extract(data, '$.id') = id),
  product_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.productId')) STORED,
  purchase_id TEXT GENERATED ALWAYS AS (CASE WHEN json_extract(data, '$.sourceType') = 'purchase' THEN json_extract(data, '$.sourceId') END) STORED,
  adjustment_id TEXT GENERATED ALWAYS AS (CASE WHEN json_extract(data, '$.sourceType') = 'adjustment' THEN json_extract(data, '$.sourceId') END) STORED,
  PRIMARY KEY(household_id, id),
  FOREIGN KEY(household_id, product_id) REFERENCES products(household_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(household_id, purchase_id) REFERENCES purchases(household_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(household_id, adjustment_id) REFERENCES adjustments(household_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX lots_product_id ON lots(household_id, product_id);
CREATE INDEX lots_purchase_id ON lots(household_id, purchase_id);
CREATE INDEX lots_adjustment_id ON lots(household_id, adjustment_id);
CREATE TABLE cookings (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data) AND json_extract(data, '$.id') = id),
  batch_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.batchId')) STORED,
  PRIMARY KEY(household_id, id),
  FOREIGN KEY(household_id, batch_id) REFERENCES batches(household_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX cookings_batch_id ON cookings(household_id, batch_id);
CREATE TABLE batches (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data) AND json_extract(data, '$.id') = id),
  cooking_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.cookingId')) STORED,
  PRIMARY KEY(household_id, id),
  FOREIGN KEY(household_id, cooking_id) REFERENCES cookings(household_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX batches_cooking_id ON batches(household_id, cooking_id);
CREATE TABLE meals (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data) AND json_extract(data, '$.id') = id),
  cooking_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.cookingId')) STORED,
  PRIMARY KEY(household_id, id),
  FOREIGN KEY(household_id, cooking_id) REFERENCES cookings(household_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX meals_cooking_id ON meals(household_id, cooking_id);
CREATE TABLE usages (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data) AND json_extract(data, '$.id') = id),
  product_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.productId')) STORED,
  meal_id TEXT GENERATED ALWAYS AS (CASE WHEN json_extract(data, '$.ownerType') = 'meal' THEN json_extract(data, '$.ownerId') END) STORED,
  cooking_id TEXT GENERATED ALWAYS AS (CASE WHEN json_extract(data, '$.ownerType') = 'cooking' THEN json_extract(data, '$.ownerId') END) STORED,
  PRIMARY KEY(household_id, id),
  FOREIGN KEY(household_id, product_id) REFERENCES products(household_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(household_id, meal_id) REFERENCES meals(household_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(household_id, cooking_id) REFERENCES cookings(household_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX usages_product_id ON usages(household_id, product_id);
CREATE INDEX usages_meal_id ON usages(household_id, meal_id);
CREATE INDEX usages_cooking_id ON usages(household_id, cooking_id);
CREATE TABLE portions (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data) AND json_extract(data, '$.id') = id),
  meal_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.mealId')) STORED,
  batch_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.batchId')) STORED,
  PRIMARY KEY(household_id, id),
  FOREIGN KEY(household_id, meal_id) REFERENCES meals(household_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(household_id, batch_id) REFERENCES batches(household_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX portions_meal_id ON portions(household_id, meal_id);
CREATE INDEX portions_batch_id ON portions(household_id, batch_id);
CREATE TABLE allocations (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data) AND json_extract(data, '$.id') = id),
  lot_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.lotId')) STORED,
  usage_id TEXT GENERATED ALWAYS AS (CASE WHEN json_extract(data, '$.ownerType') = 'usage' THEN json_extract(data, '$.ownerId') END) STORED,
  adjustment_id TEXT GENERATED ALWAYS AS (CASE WHEN json_extract(data, '$.ownerType') = 'adjustment' THEN json_extract(data, '$.ownerId') END) STORED,
  PRIMARY KEY(household_id, id),
  FOREIGN KEY(household_id, lot_id) REFERENCES lots(household_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(household_id, usage_id) REFERENCES usages(household_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(household_id, adjustment_id) REFERENCES adjustments(household_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX allocations_lot_id ON allocations(household_id, lot_id);
CREATE INDEX allocations_usage_id ON allocations(household_id, usage_id);
CREATE INDEX allocations_adjustment_id ON allocations(household_id, adjustment_id);
CREATE TABLE adjustments (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data) AND json_extract(data, '$.id') = id),
  product_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.productId')) STORED,
  added_lot_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.addedLotId')) STORED,
  source_lot_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.sourceLotId')) STORED,
  PRIMARY KEY(household_id, id),
  FOREIGN KEY(household_id, product_id) REFERENCES products(household_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(household_id, added_lot_id) REFERENCES lots(household_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(household_id, source_lot_id) REFERENCES lots(household_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX adjustments_product_id ON adjustments(household_id, product_id);
CREATE INDEX adjustments_added_lot_id ON adjustments(household_id, added_lot_id);
CREATE INDEX adjustments_source_lot_id ON adjustments(household_id, source_lot_id);
CREATE TABLE discards (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data) AND json_extract(data, '$.id') = id),
  batch_id TEXT GENERATED ALWAYS AS (json_extract(data, '$.batchId')) STORED,
  PRIMARY KEY(household_id, id),
  FOREIGN KEY(household_id, batch_id) REFERENCES batches(household_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX discards_batch_id ON discards(household_id, batch_id);
