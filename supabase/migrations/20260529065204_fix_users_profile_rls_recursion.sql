-- Avoid self-referential users RLS recursion during profile updates. The
-- security-definer helper already resolves the active caller's store.

DROP POLICY IF EXISTS "Users can update their own user profile name" ON public.users;
CREATE POLICY "Users can update their own user profile name"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (
    id = (SELECT auth.uid())
    AND store_id IS NOT DISTINCT FROM (SELECT public.get_user_store_id())
  );
