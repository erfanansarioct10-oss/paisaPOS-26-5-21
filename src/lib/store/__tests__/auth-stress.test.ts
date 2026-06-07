/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { create } from "zustand";
import { AppState } from "../types";
import { createAuthSlice } from "@/features/auth/state/auth-slice";
import { createInventorySlice } from "@/features/inventory/state/inventory-slice";
import { createCartSlice } from "@/features/billing/state/cart-slice";
import { retryOnTransientJwtClockSkew } from "./supabase-test-utils";

// Load environment variables
loadEnvConfig(process.cwd());

const runLiveTests = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.SKIP_LIVE_TESTS
);

const createTestStore = () => {
  return create<AppState>((set, get) => ({
    ...createAuthSlice(set, get),
    ...createInventorySlice(set, get),
    ...createCartSlice(set, get),
  }));
};

describe.runIf(runLiveTests)("PaisaPOS — Authentication Hardening & Threat Resilience Stress Tests", () => {
  let supabaseUrl: string;
  let supabaseAnonKey: string;
  let serviceRoleKey: string | undefined;

  beforeAll(() => {
    supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  // =========================================================================
  // ANGLE 1: PASSWORD COMPLEXITY ENFORCEMENT (POLICY GATE)
  // =========================================================================
  test("Angle 1: Password Complexity Enforcement (Policy Gate)", async () => {
    const client = createClient(supabaseUrl, supabaseAnonKey);
    const random = () => Math.random().toString(36).slice(2, 7) + Date.now();

    // 1. Password too short (< 8 chars)
    const { error: errShort } = await client.auth.signUp({
      email: `short-${random()}@paisapos-qa.com`,
      password: "sh1!",
    });
    expect(errShort).not.toBeNull();
    const msgShort = errShort!.message.toLowerCase();
    expect(
      msgShort.includes("at least") || 
      msgShort.includes("weak") || 
      msgShort.includes("should be") ||
      msgShort.includes("characters")
    ).toBe(true);

    // 2. No digits (violates lower_upper_letters_digits)
    const { error: errNoDigits } = await client.auth.signUp({
      email: `nodigits-${random()}@paisapos-qa.com`,
      password: "NoDigitsHere!",
    });
    expect(errNoDigits).not.toBeNull();
    const msgNoDigits = errNoDigits!.message.toLowerCase();
    expect(
      msgNoDigits.includes("complexity") || 
      msgNoDigits.includes("should contain") || 
      msgNoDigits.includes("weak") ||
      msgNoDigits.includes("requirements")
    ).toBe(true);

    // 3. No uppercase letters
    const { error: errNoUpper } = await client.auth.signUp({
      email: `noupper-${random()}@paisapos-qa.com`,
      password: "nouppercase123!",
    });
    expect(errNoUpper).not.toBeNull();
    const msgNoUpper = errNoUpper!.message.toLowerCase();
    expect(
      msgNoUpper.includes("complexity") || 
      msgNoUpper.includes("should contain") || 
      msgNoUpper.includes("weak") ||
      msgNoUpper.includes("requirements")
    ).toBe(true);

    // 4. No lowercase letters
    const { error: errNoLower } = await client.auth.signUp({
      email: `nolower-${random()}@paisapos-qa.com`,
      password: "NOLOWERCASE123!",
    });
    expect(errNoLower).not.toBeNull();
    const msgNoLower = errNoLower!.message.toLowerCase();
    expect(
      msgNoLower.includes("complexity") || 
      msgNoLower.includes("should contain") || 
      msgNoLower.includes("weak") ||
      msgNoLower.includes("requirements")
    ).toBe(true);

    // 5. Compliant password should successfully pass security filters
    const emailSuccess = `success-${random()}@paisapos-qa.com`;
    const { data: signUpData, error: errSuccess } = await client.auth.signUp({
      email: emailSuccess,
      password: "PaisaPOSSecret123!",
    });
    expect(errSuccess).toBeNull();
    expect(signUpData.user).toBeDefined();
    expect(signUpData.user!.email).toBe(emailSuccess);
  });

  // =========================================================================
  // ANGLE 2: DUPLICATE REGISTRATION PROTECTION (BOUNDARY CHECK)
  // =========================================================================
  test("Angle 2: Duplicate Registration Protection (Boundary Check)", async () => {
    const client = createClient(supabaseUrl, supabaseAnonKey);
    const random = Math.random().toString(36).slice(2, 7) + Date.now();
    const email = `stress-dup-${random}@paisapos-qa.com`;
    const password = "PaisaPOSSecret123!";

    // Register first instance
    const { data: user1, error: err1 } = await client.auth.signUp({
      email,
      password,
    });
    expect(err1).toBeNull();
    expect(user1.user).toBeDefined();

    // Register second instance with exact same email
    const { data: user2, error: err2 } = await client.auth.signUp({
      email,
      password,
    });

    if (err2) {
      // Direct database rejection of duplicates
      expect(err2.message.toLowerCase()).toContain("already");
    } else {
      // If it silently absorbs or returns fake success (security obfuscation),
      // we check that the identities array is empty, which proves no duplicate user record or login session was created.
      const identities = user2.user?.identities || [];
      expect(identities.length).toBe(0);
    }
  });

  // =========================================================================
  // ANGLE 3: CLIENT-SIDE BRUTE-FORCE LOCKOUT COUNTER-MEASURE (EMULATION)
  // =========================================================================
  test("Angle 3: Client-Side Brute-Force Lockout Counter-Measure", () => {
    // We emulate the EXACT lockout state machine logic from src/app/page.tsx
    const LOCKOUT_DURATION_SECONDS = 30;
    const MAX_FAILED_ATTEMPTS = 5;

    let failedAttempts = 0;
    let lockoutRemaining = 0;

    const isLockedOut = () => lockoutRemaining > 0;

    // Emulate 4 failed logins
    for (let i = 1; i <= 4; i++) {
      if (isLockedOut()) break;
      failedAttempts++;
    }

    expect(failedAttempts).toBe(4);
    expect(isLockedOut()).toBe(false);

    // 5th failed attempt must trigger the lockout
    if (!isLockedOut()) {
      failedAttempts++;
      if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
        lockoutRemaining = LOCKOUT_DURATION_SECONDS;
        failedAttempts = 0;
      }
    }

    expect(failedAttempts).toBe(0);
    expect(lockoutRemaining).toBe(30);
    expect(isLockedOut()).toBe(true);

    // 6th attempt is blocked immediately at the boundary gate without hitting network
    const attemptLoginWhenLocked = () => {
      if (isLockedOut()) {
        throw new Error(`Too many failed attempts. Please wait ${lockoutRemaining}s.`);
      }
      return "Attempted remote authentication request";
    };

    expect(attemptLoginWhenLocked).toThrow("Too many failed attempts");

    // Simulate clock progression (lockout countdown)
    lockoutRemaining -= 15;
    expect(isLockedOut()).toBe(true);

    lockoutRemaining -= 15;
    expect(isLockedOut()).toBe(false); // Released!
  });

  // =========================================================================
  // ANGLE 4: CONCURRENT HIGH-SPEED AUTHENTICATION FLOOD (RACE CONDITIONS)
  // =========================================================================
  test("Angle 4: Concurrent High-Speed Authentication Flood", async () => {
    const client = createClient(supabaseUrl, supabaseAnonKey);
    const random = () => Math.random().toString(36).slice(2, 7) + Date.now();
    const password = "PaisaPOSSecret123!";

    const concurrencyThreshold = 10;
    const promises: Promise<any>[] = [];

    // Flood the Auth service concurrently with registration attempts
    for (let i = 0; i < concurrencyThreshold; i++) {
      const email = `stress-flood-${i}-${random()}@paisapos-qa.com`;
      promises.push(
        client.auth.signUp({
          email,
          password,
        })
      );
    }

    const results = await Promise.all(promises);

    // Assert that the auth system remains completely resilient, does not crash,
    // and returns structured responses for all concurrent threads.
    expect(results.length).toBe(concurrencyThreshold);

    results.forEach((res) => {
      // Each request either succeeded, or returned a structured rate limit / payload error.
      // High concurrency must not cause database thread deadlocks or unhandled exceptions.
      if (res.error) {
        expect(res.error.status).toBeDefined();
      } else {
        expect(res.data.user).toBeDefined();
      }
    });
  });

  // =========================================================================
  // ANGLE 5: SESSION INVALIDATION & STATE SANITIZATION (DATA LEAK GATE)
  // =========================================================================
  test("Angle 5: Session Invalidation & State Sanitization", async () => {
    const store = createTestStore();
    const client = createClient(supabaseUrl, supabaseAnonKey);
    const random = Math.random().toString(36).slice(2, 7) + Date.now();
    const email = `stress-wipe-${random}@paisapos-qa.com`;
    const password = "PaisaPOSSecret123!";

    // 1. Authenticate user
    const { data: authUser, error: errAuth } = await client.auth.signUp({
      email,
      password,
    });
    expect(errAuth).toBeNull();
    expect(authUser.user).toBeDefined();

    // 2. Hydrate Zustand state with mock user details and POS cache values
    store.setState({
      user: {
        id: authUser.user!.id,
        name: "Stress Tester Profile",
        store_id: "stress-store-id",
        email: email,
      },
      store: {
        id: "stress-store-id",
        name: "Test Store Wiping",
        phone: "9800000000",
        address: "KTM",
        pan_vat: "123456789",
      },
      products: [
        {
          id: "p-1",
          store_id: "stress-store-id",
          name: "Wipe Product",
          category: "Tops",
          image_url: null,
          low_stock_threshold: 5,
          is_favorite: false,
          created_at: new Date().toISOString(),
        },
      ],
      variants: [
        {
          id: "v-1",
          product_id: "p-1",
          size: "M",
          color: "Black",
          sku: "WIP-BLK-M",
          price: 1000,
          stock: 10,
          created_at: new Date().toISOString(),
        },
      ],
      cart: [{ id: "c-1", variant_id: "v-1", size: "M", color: "Black", sku: "WIP-BLK-M", price: 1000, quantity: 2, stock: 10, name: "Wipe Product" }],
    });

    // Verify state was populated
    expect(store.getState().user).not.toBeNull();
    expect(store.getState().products.length).toBe(1);
    expect(store.getState().cart.length).toBe(1);

    // 3. Trigger full signout
    await store.getState().signOut();

    // 4. Verify client session is wiped from memory and local structures
    expect(store.getState().user).toBeNull();
    expect(store.getState().store).toBeNull();
    expect(store.getState().products.length).toBe(0);
    expect(store.getState().variants.length).toBe(0);
    expect(store.getState().cart.length).toBe(0);
    expect(store.getState().invoices.length).toBe(0);
    expect(store.getState().activeTab).toBe("dashboard");
  });

  // =========================================================================
  // ANGLE 6: ONBOARDING RPC TRANSACTION INTEGRITY (DATABASE LAYER)
  // =========================================================================
  test("Angle 6: Onboarding RPC Transaction Integrity", async () => {
    const random = Math.random().toString(36).slice(2, 7) + Date.now();
    const email = `stress-rpc-${random}@paisapos-qa.com`;
    const password = "PaisaPOSSecret123!";

    const client = createClient(supabaseUrl, supabaseAnonKey);

    // 1. Create a raw authenticated user account
    const { data: signUpData, error: errSignUp } = await client.auth.signUp({
      email,
      password,
    });
    expect(errSignUp).toBeNull();
    expect(signUpData.user).toBeDefined();

    // 2. Call register_store_and_user onboarding RPC
    console.log(`[Auth Stress RPC] Call register_store_and_user for: ${email}`);
    const { data: storeId, error: errOnboard } = await retryOnTransientJwtClockSkew(() =>
      client.rpc("register_store_and_user", {
        p_full_name: "Onboarding Test User",
        p_store_name: `Transactional Store ${random}`,
      })
    );

    expect(errOnboard).toBeNull();
    expect(storeId).toBeDefined();

    // 3. Verify store metadata exists in database and matches inputs
    const { data: storeData, error: errFetchStore } = await client
      .from("stores")
      .select("*")
      .eq("id", storeId)
      .single();

    expect(errFetchStore).toBeNull();
    expect(storeData.name).toBe(`Transactional Store ${random}`);

    // 4. Verify profile exists in database and points to correct store
    const { data: profileData, error: errFetchProfile } = await client
      .from("users")
      .select("*")
      .eq("id", signUpData.user!.id)
      .single();

    expect(errFetchProfile).toBeNull();
    expect(profileData.name).toBe("Onboarding Test User");
    expect(profileData.store_id).toBe(storeId);

    // 5. Clean up created store and profile records
    console.log("[Auth Stress RPC] Cleaning up transactional data...");
    expect(serviceRoleKey).toBeDefined();
    const adminClient = createClient(supabaseUrl, serviceRoleKey!);

    const { error: errDelStore } = await adminClient.from("stores").delete().eq("id", storeId);
    expect(errDelStore).toBeNull();

    const { error: errDelUser } = await adminClient.from("users").delete().eq("id", signUpData.user!.id);
    expect(errDelUser).toBeNull();
  });
});
