import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const staffPassword = "E2eStaffPassword123!";

type OwnerProfile = {
  id: string;
  name: string;
  storeId: string;
};

type StaffE2ECleanup = {
  authUserIds: string[];
  publicUserIds: string[];
  invitationIds: string[];
  delegationIds: string[];
};

function canRunDbBackedStaffE2E() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function uniqueStaffId(label: string) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function getCurrentAuthUserId(page: Page): Promise<string | null> {
  function findUserIdFromCookies(cookies: Array<{ name: string; value: string }>) {
    const authCookieGroups = new Map<string, Array<{ name: string; value: string }>>();

    for (const cookie of cookies) {
      if (!/^sb-.*-auth-token(?:\.\d+)?$/.test(cookie.name)) continue;

      const groupName = cookie.name.replace(/\.\d+$/, "");
      authCookieGroups.set(groupName, [...(authCookieGroups.get(groupName) ?? []), cookie]);
    }

    for (const group of authCookieGroups.values()) {
      const rawValue = group
        .sort((left, right) => {
          const leftIndex = Number(left.name.match(/\.(\d+)$/)?.[1] ?? 0);
          const rightIndex = Number(right.name.match(/\.(\d+)$/)?.[1] ?? 0);
          return leftIndex - rightIndex;
        })
        .map((cookie) => cookie.value)
        .join("");

      const decodedValue = rawValue.startsWith("base64-")
        ? Buffer.from(rawValue.slice("base64-".length), "base64url").toString("utf8")
        : decodeURIComponent(rawValue);

      try {
        const parsed = JSON.parse(decodedValue) as {
          access_token?: string;
          user?: { id?: string };
        };

        if (parsed.user?.id) return parsed.user.id;

        if (parsed.access_token) {
          const [, payload] = parsed.access_token.split(".");
          if (!payload) continue;

          const jwtPayload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
            sub?: string;
          };
          if (jwtPayload.sub) return jwtPayload.sub;
        }
      } catch {
        // Ignore unrelated or expired auth-cookie values.
      }
    }

    return null;
  }

  function findUserIdFromStorage(entries: Array<{ value: string }>) {
    for (const entry of entries) {
      try {
        const parsed = JSON.parse(entry.value) as {
          user?: { id?: string };
          session?: { user?: { id?: string } };
          currentSession?: { user?: { id?: string } };
        };
        const userId = parsed.user?.id ?? parsed.session?.user?.id ?? parsed.currentSession?.user?.id;
        if (userId) return userId;
      } catch {
        // Ignore unrelated localStorage values.
      }
    }

    return null;
  }

  const state = await page.context().storageState();
  const fromCookies = findUserIdFromCookies(state.cookies);
  if (fromCookies) return fromCookies;

  const fromStorageState = findUserIdFromStorage(state.origins.flatMap((origin) => origin.localStorage));
  if (fromStorageState) return fromStorageState;

  await page.goto("/staff");
  return page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(key) ?? "") as {
          user?: { id?: string };
          session?: { user?: { id?: string } };
          currentSession?: { user?: { id?: string } };
        };
        const userId = parsed.user?.id ?? parsed.session?.user?.id ?? parsed.currentSession?.user?.id;
        if (userId) return userId;
      } catch {
        // Ignore unrelated localStorage values.
      }
    }

    return null;
  });
}

async function getE2EOwnerProfile(adminClient: SupabaseClient, page: Page): Promise<OwnerProfile> {
  const ownerUserId = await getCurrentAuthUserId(page);
  expect(ownerUserId).toBeTruthy();

  const { data: profile, error: profileError } = await adminClient
    .from("users")
    .select("id, name, store_id")
    .eq("id", ownerUserId!)
    .single();
  expect(profileError).toBeNull();
  expect(profile?.store_id).toBeTruthy();

  return {
    id: profile!.id as string,
    name: profile!.name as string,
    storeId: profile!.store_id as string,
  };
}

async function createAuthUser(email: string, cleanup: StaffE2ECleanup) {
  const authClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.signUp({
    email,
    password: staffPassword,
  });
  expect(error).toBeNull();
  expect(data.user?.id).toBeDefined();
  cleanup.authUserIds.push(data.user!.id);
  await authClient.auth.signOut();
  return data.user!.id;
}

async function cleanupStaffE2E(adminClient: SupabaseClient, cleanup: StaffE2ECleanup) {
  for (const delegationId of cleanup.delegationIds.reverse()) {
    await adminClient.from("privilege_delegations").delete().eq("id", delegationId);
  }

  for (const invitationId of cleanup.invitationIds.reverse()) {
    await adminClient.from("staff_invitations").delete().eq("id", invitationId);
  }

  for (const userId of cleanup.publicUserIds.reverse()) {
    await adminClient.from("users").delete().eq("id", userId);
  }

  for (const authUserId of cleanup.authUserIds.reverse()) {
    await adminClient.auth.admin.deleteUser(authUserId);
  }
}

test.describe("Owner Staff Management", () => {
  test("renders staff directory and creates a pending cashier invite", async ({ page }) => {
    const inviteEmail = `playwright-staff-${Date.now()}@paisapos-test.com`;

    await page.goto("/staff");

    await expect(page.getByRole("heading", { name: "Staff" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("link", { name: "Staff", exact: true })).toBeVisible();
    await expect(page.locator("#staff-email")).toBeVisible();
    await expect(page.getByText("Active Directory")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Invitations", exact: true })).toBeVisible();

    await page.locator("#staff-email").fill(inviteEmail);
    await page.getByRole("button", { name: "Send Invite" }).click();

    await expect(page.getByText(`Invitation sent to ${inviteEmail}.`)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(inviteEmail, { exact: true })).toBeVisible();
  });

  test("keeps staff invite context visible when the signed-in account is mismatched", async ({ page }) => {
    test.skip(!canRunDbBackedStaffE2E(), "Supabase service role env is required for DB-backed staff E2E setup.");

    const adminClient = createAdminClient();
    const cleanup: StaffE2ECleanup = {
      authUserIds: [],
      publicUserIds: [],
      invitationIds: [],
      delegationIds: [],
    };

    try {
      const owner = await getE2EOwnerProfile(adminClient, page);
      const inviteEmail = `${uniqueStaffId("pw-accept")}@paisapos-test.com`;
      const { data: invitation, error: invitationError } = await adminClient
        .from("staff_invitations")
        .insert({
          store_id: owner.storeId,
          email: inviteEmail,
          role: "cashier",
          status: "pending",
          invited_by_user_id: owner.id,
          expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        })
        .select("id")
        .single();
      expect(invitationError).toBeNull();
      cleanup.invitationIds.push(invitation!.id as string);

      await page.goto(`/staff/accept?invitationId=${invitation!.id}`);

      await expect(page.getByRole("heading", { name: "Accept Staff Invite" })).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(inviteEmail, { exact: true }).first()).toBeVisible();
      await expect(
        page.getByText(`This invite belongs to ${inviteEmail}. Switch accounts to continue with that email.`),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Switch Account" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Set Up Staff Account" })).toHaveCount(0);
    } finally {
      await cleanupStaffE2E(adminClient, cleanup);
    }
  });

  test("returns an invited cashier to the accept page after manual sign-in", async ({ page }) => {
    test.skip(!canRunDbBackedStaffE2E(), "Supabase service role env is required for DB-backed staff E2E setup.");

    const adminClient = createAdminClient();
    const cleanup: StaffE2ECleanup = {
      authUserIds: [],
      publicUserIds: [],
      invitationIds: [],
      delegationIds: [],
    };

    try {
      const owner = await getE2EOwnerProfile(adminClient, page);
      const inviteEmail = `${uniqueStaffId("pw-return")}@paisapos-test.com`;
      await createAuthUser(inviteEmail, cleanup);

      const { data: invitation, error: invitationError } = await adminClient
        .from("staff_invitations")
        .insert({
          store_id: owner.storeId,
          email: inviteEmail,
          role: "cashier",
          status: "pending",
          invited_by_user_id: owner.id,
          expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        })
        .select("id")
        .single();
      expect(invitationError).toBeNull();
      cleanup.invitationIds.push(invitation!.id as string);

      const acceptPath = `/staff/accept?invitationId=${invitation!.id}`;
      await page.goto("/");
      await page.evaluate(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
      });
      await page.context().clearCookies();

      await page.goto(`/?next=${encodeURIComponent(acceptPath)}`);
      await expect(page).toHaveURL(/\/\?next=/, { timeout: 15000 });
      await expect(page.locator("#email")).toBeVisible();

      await page.locator("#email").fill(inviteEmail);
      await page.locator("#pass").fill(staffPassword);
      await page.getByRole("button", { name: "Sign In to Store" }).click();

      await expect(page).toHaveURL(new RegExp(`/staff/accept\\?invitationId=${invitation!.id}`), { timeout: 15000 });
      await expect(page.getByRole("heading", { name: "Accept Staff Invite" })).toBeVisible();
      await expect(page.getByText("Signed in as")).toBeVisible();
      await expect(page.getByText(inviteEmail, { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Set Up Staff Account" })).toBeVisible();
    } finally {
      await cleanupStaffE2E(adminClient, cleanup);
    }
  });

  test("suspends a cashier from the staff page and clears active temporary access", async ({ page }) => {
    test.skip(!canRunDbBackedStaffE2E(), "Supabase service role env is required for DB-backed staff E2E setup.");

    const adminClient = createAdminClient();
    const cleanup: StaffE2ECleanup = {
      authUserIds: [],
      publicUserIds: [],
      invitationIds: [],
      delegationIds: [],
    };

    try {
      const owner = await getE2EOwnerProfile(adminClient, page);
      const random = uniqueStaffId("pw-suspend");
      const cashierEmail = `${random}@paisapos-test.com`;
      const cashierName = `PW Audit Cashier ${random}`;

      const cashierUserId = await createAuthUser(cashierEmail, cleanup);
      cleanup.publicUserIds.push(cashierUserId);

      const { error: profileError } = await adminClient.from("users").insert({
        id: cashierUserId,
        name: cashierName,
        store_id: owner.storeId,
        role: "cashier",
        status: "active",
        invited_by_user_id: owner.id,
      });
      expect(profileError).toBeNull();

      const { data: delegation, error: delegationError } = await adminClient
        .from("privilege_delegations")
        .insert({
          store_id: owner.storeId,
          granted_to_user_id: cashierUserId,
          granted_by_user_id: owner.id,
          scope: "inventory.adjust",
          reason: "Playwright audit suspension path",
          starts_at: new Date(Date.now() - 60 * 1000).toISOString(),
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })
        .select("id")
        .single();
      expect(delegationError).toBeNull();
      const delegationId = delegation!.id as string;
      cleanup.delegationIds.push(delegationId);

      await page.goto("/staff");

      await expect(page.getByRole("heading", { name: "Staff" })).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(cashierName).first()).toBeVisible();
      const temporaryAccessSection = page.locator("section").filter({
        has: page.getByRole("heading", { name: "Temporary Access" }),
      });
      await expect(temporaryAccessSection.getByText("Inventory Adjustment", { exact: true })).toBeVisible();
      await expect(temporaryAccessSection.getByText("Reason: Playwright audit suspension path")).toBeVisible();

      const cashierRow = page.locator("[data-testid='staff-directory-row']").filter({ hasText: cashierName });
      await expect(cashierRow).toBeVisible();
      await cashierRow.getByPlaceholder("Type SUSPEND").fill("SUSPEND");
      await cashierRow.getByRole("button", { name: "Suspend access" }).click();

      await expect(cashierRow.getByText("Suspended")).toBeVisible({ timeout: 15000 });
      await expect(cashierRow.getByRole("button", { name: "Reactivate" })).toBeVisible();

      await expect
        .poll(async () => {
          const { data } = await adminClient
            .from("users")
            .select("status")
            .eq("id", cashierUserId)
            .single();
          return data?.status;
        })
        .toBe("suspended");

      await expect
        .poll(async () => {
          const { data } = await adminClient
            .from("privilege_delegations")
            .select("revoked_at, revoked_by_user_id")
            .eq("id", delegationId)
            .single();
          return data?.revoked_at && data.revoked_by_user_id === owner.id ? "revoked" : "active";
        })
        .toBe("revoked");

      await page.reload();
      await expect(temporaryAccessSection.getByText("Reason: Playwright audit suspension path")).toHaveCount(0);
    } finally {
      await cleanupStaffE2E(adminClient, cleanup);
    }
  });
});
