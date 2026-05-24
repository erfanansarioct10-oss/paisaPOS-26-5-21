-- =========================================================================
-- PaisaPOS Store and User Deletion RLS Fix
-- Deployed: 2026-05-24
--
-- Restores DELETE policies for the stores and users tables so that
-- authorized owners can delete their own store record and users can delete
-- their own profiles (self-termination / teardown).
-- =========================================================================

-- 1. Restore DELETE policy on stores for owners
DROP POLICY IF EXISTS "Owners can delete their own store record" ON stores;
CREATE POLICY "Owners can delete their own store record" ON stores
  FOR DELETE USING (
    id = (SELECT get_user_store_id()) AND
    (SELECT role FROM users WHERE id = auth.uid()) = 'owner'
  );

-- 2. Restore DELETE policy on users for self-deletion
DROP POLICY IF EXISTS "Users can delete their own user profile" ON users;
CREATE POLICY "Users can delete their own user profile" ON users
  FOR DELETE USING (
    id = auth.uid()
  );
