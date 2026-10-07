CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  active_space_id TEXT NOT NULL,
  FOREIGN KEY(active_space_id, user_id) REFERENCES space_members(space_id, user_id) ON DELETE CASCADE
);
CREATE TABLE space_invitations (
  token_hash TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES user(id),
  expires_at INTEGER NOT NULL,
  accepted_by TEXT REFERENCES user(id),
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX space_invitations_space ON space_invitations(space_id);
-- Claim and membership creation share a transaction. Competing claimants cannot
-- both consume a link, and a failed membership insert rolls back the claim.
CREATE TRIGGER invitation_claim_guard BEFORE UPDATE OF accepted_by ON space_invitations
WHEN NEW.accepted_by IS NOT NULL BEGIN
  SELECT RAISE(ABORT, 'invitation_unavailable') WHERE OLD.accepted_by IS NOT NULL
    OR OLD.revoked_at IS NOT NULL OR OLD.expires_at <= unixepoch()
    OR NOT EXISTS (SELECT 1 FROM space_members WHERE space_id = OLD.space_id AND user_id = OLD.created_by AND role = 'owner');
END;
CREATE TRIGGER invitation_join AFTER UPDATE OF accepted_by ON space_invitations
WHEN NEW.accepted_by IS NOT NULL BEGIN
  INSERT OR IGNORE INTO space_members (space_id, user_id, role) VALUES (NEW.space_id, NEW.accepted_by, 'member');
  INSERT INTO user_preferences (user_id, active_space_id) VALUES (NEW.accepted_by, NEW.space_id)
    ON CONFLICT(user_id) DO UPDATE SET active_space_id = excluded.active_space_id;
END;
