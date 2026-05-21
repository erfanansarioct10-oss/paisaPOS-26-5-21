-- Re-create audit logs RLS policies to enforce immutability
DROP POLICY IF EXISTS "Users can manage audit logs of their store" ON audit_logs;
DROP POLICY IF EXISTS "Users can read audit logs of their store" ON audit_logs;
DROP POLICY IF EXISTS "Users can insert audit logs for their store" ON audit_logs;

CREATE POLICY "Users can read audit logs of their store" ON audit_logs FOR SELECT USING (store_id = get_user_store_id());
CREATE POLICY "Users can insert audit logs for their store" ON audit_logs FOR INSERT WITH CHECK (store_id = get_user_store_id());
