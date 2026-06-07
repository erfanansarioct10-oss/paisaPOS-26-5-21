-- Freeze temporary delegation scope surface for the V1.1 production release.
-- Reports and invoice correction remain owner-role privileges until dedicated delegated flows ship.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.privilege_delegations
    WHERE scope NOT IN (
      'catalog.manage'::public.privilege_scope,
      'inventory.adjust'::public.privilege_scope
    )
  ) THEN
    RAISE EXCEPTION 'Cannot freeze V1.1 delegation scopes while unreleased delegation rows exist.';
  END IF;
END;
$$;

ALTER TABLE public.privilege_delegations
  DROP CONSTRAINT IF EXISTS privilege_delegations_scope_allowed;

ALTER TABLE public.privilege_delegations
  ADD CONSTRAINT privilege_delegations_scope_allowed CHECK (
    scope IN (
      'catalog.manage'::public.privilege_scope,
      'inventory.adjust'::public.privilege_scope
    )
  );

COMMENT ON CONSTRAINT privilege_delegations_scope_allowed ON public.privilege_delegations IS
  'V1.1 production release allows only catalog.manage and inventory.adjust temporary delegations.';

COMMENT ON COLUMN public.privilege_delegations.scope IS
  'Delegated privilege scope. V1.1 production allows only catalog.manage and inventory.adjust.';
