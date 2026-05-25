import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";

// 1. Initialize and Load Environment Variables
loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Color codes for professional console outputs
const reset = "\x1b[0m";
const bright = "\x1b[1m";
const red = "\x1b[31m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const magenta = "\x1b[35m";
const cyan = "\x1b[36m";

function logHeader(title: string) {
  console.log(`\n${bright}${magenta}=== ${title.toUpperCase()} ===${reset}`);
}

function logInfo(msg: string) {
  console.log(`${cyan}[INFO]${reset} ${msg}`);
}

function logSuccess(msg: string) {
  console.log(`${green}[PASS]${reset} ${msg}`);
}

function logWarning(msg: string) {
  console.log(`${yellow}[WARN]${reset} ${msg}`);
}

function logError(msg: string) {
  console.log(`${red}[FAIL]${reset} ${msg}`);
}

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

async function main() {
  console.log(`
${bright}${green}┌────────────────────────────────────────────────────────┐
│   🇳🇵   PaisaPOS Enterprise Security & Stress Toolkit     │
│   Concurrently Hardening Nepali Boutique Commerce OS   │
└────────────────────────────────────────────────────────┘${reset}
`);

  if (!supabaseUrl || !supabaseAnonKey) {
    logError("Supabase URL or Publishable Anon Key not detected in environment variables.");
    console.log("Please ensure .env.local contains NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    process.exit(1);
  }

  if (!serviceRoleKey) {
    logWarning("SUPABASE_SERVICE_ROLE_KEY is not defined.");
    logWarning("Privilege Escalation and Threat Anomaly Scanner validations will be bypassed.");
    logWarning("To execute the full suite, add the Service Role Key to .env.local.");
  }

  logInfo(`Connecting to Supabase at: ${bright}${supabaseUrl}${reset}`);
  
  const clientOwner = createClient(supabaseUrl, supabaseAnonKey);
  const clientCashier = createClient(supabaseUrl, supabaseAnonKey);
  const adminClient = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

  const randomSuffix = Math.random().toString(36).slice(2, 7) + Date.now();
  const testOwnerEmail = `stress-owner-${randomSuffix}@paisapos-stress.com`;
  const testCashierEmail = `stress-cashier-${randomSuffix}@paisapos-stress.com`;
  const testPassword = "SecurityDefinerPass123!";

  let ownerId = "";
  let cashierId = "";
  let storeId = "";
  let var1Id = "";
  let var2Id = "";

  const runResults = {
    deadlockPrevention: false,
    privilegeEscalationRejected: false,
    priceTamperingBlocked: false,
    bruteForceAnomalyAlerted: false,
    latencies: [] as number[],
  };

  try {
    // =========================================================================
    // ONBOARDING TEST STORE
    // =========================================================================
    logHeader("Setup & Store Onboarding");
    logInfo(`Registering store owner account: ${bright}${testOwnerEmail}${reset}`);
    const { data: signUpOwner, error: errSignUpOwner } = await clientOwner.auth.signUp({
      email: testOwnerEmail,
      password: testPassword,
    });

    if (errSignUpOwner || !signUpOwner.user) {
      throw new Error(`Failed to sign up store owner: ${errSignUpOwner?.message}`);
    }
    ownerId = signUpOwner.user.id;
    logSuccess(`Owner account created with ID: ${ownerId}`);

    logInfo("Invoking onboarding RPC: register_store_and_user...");
    const { data: registeredStoreId, error: errOnboard } = await clientOwner.rpc("register_store_and_user", {
      p_full_name: "Stress Test Operator",
      p_store_name: `Stress Arena Boutique - ${randomSuffix}`,
    });

    if (errOnboard || !registeredStoreId) {
      throw new Error(`Onboarding RPC failed: ${errOnboard?.message}`);
    }
    storeId = registeredStoreId;
    logSuccess(`Store successfully onboarded and secured! Store ID: ${storeId}`);

    // Create 2 test catalog product variants for checkout locking checks
    logInfo("Creating catalog products and variants...");
    const { data: product, error: errProd } = await clientOwner
      .from("products")
      .insert({
        store_id: storeId,
        name: "Stress Premium Kurti",
        category: "Ethnic Wear",
        low_stock_threshold: 5,
      })
      .select()
      .single();

    if (errProd || !product) {
      throw new Error(`Failed to create product: ${errProd?.message}`);
    }

    const { data: variants, error: errVars } = await clientOwner
      .from("product_variants")
      .insert([
        { product_id: product.id, size: "M", color: "Red", sku: `SKU-RED-M-${randomSuffix}`, price: 2000 },
        { product_id: product.id, size: "L", color: "Blue", sku: `SKU-BLU-L-${randomSuffix}`, price: 2500 }
      ])
      .select();

    if (errVars || !variants || variants.length < 2) {
      throw new Error(`Failed to create variants: ${errVars?.message}`);
    }

    var1Id = variants[0].id;
    var2Id = variants[1].id;

    logInfo(`Variant 1 ID: ${var1Id} (Price: Rs. 2000)`);
    logInfo(`Variant 2 ID: ${var2Id} (Price: Rs. 2500)`);

    // Add stock
    await clientOwner.from("inventory").insert([
      { variant_id: var1Id, quantity: 500 },
      { variant_id: var2Id, quantity: 500 }
    ]);
    logSuccess("Test inventory stock initialized successfully!");

    // Set up Cashier profile if admin client is available
    if (adminClient) {
      logInfo(`Registering cashier session: ${bright}${testCashierEmail}${reset}`);
      const { data: signUpCashier, error: errSignUpCashier } = await clientCashier.auth.signUp({
        email: testCashierEmail,
        password: testPassword,
      });

      if (errSignUpCashier || !signUpCashier.user) {
        throw new Error(`Failed to sign up cashier user: ${errSignUpCashier?.message}`);
      }
      cashierId = signUpCashier.user.id;

      logInfo("Inserting cashier profile into database with role = 'cashier'...");
      const { error: errProfileInsert } = await adminClient.from("users").insert({
        id: cashierId,
        name: "Stress Arena Cashier",
        store_id: storeId,
        role: "cashier",
      });

      if (errProfileInsert) {
        throw new Error(`Failed to insert cashier profile: ${errProfileInsert.message}`);
      }
      logSuccess("Cashier profile initialized with role constraints!");
    }

    // =========================================================================
    // STRESS TEST 1: CONCURRENT LOCK SERIALIZATION (DEADLOCK FLOOD)
    // =========================================================================
    logHeader("Stress Test 1: Concurrency Lock Serialization & Deadlock Verification");
    logInfo("Initiating concurrent checkout floods in opposing locks order...");
    logInfo("Alternating cart sorting orders to trigger Postgres race conditions...");

    const concurrencyThreshold = envInt("AUDIT_CHECKOUT_CONCURRENCY", 20);
    const checkoutPromises: PromiseLike<{ duration: number; error: { message: string } | null; success: boolean }>[] = [];

    for (let i = 0; i < concurrencyThreshold; i++) {
      // Alternate lock sorting order (A -> B vs B -> A)
      const items = i % 2 === 0
        ? [
            { variant_id: var1Id, quantity: 1, unit_price: 2000, subtotal: 2000 },
            { variant_id: var2Id, quantity: 1, unit_price: 2500, subtotal: 2500 }
          ]
        : [
            { variant_id: var2Id, quantity: 1, unit_price: 2500, subtotal: 2500 },
            { variant_id: var1Id, quantity: 1, unit_price: 2000, subtotal: 2000 }
          ];

      const start = Date.now();
      const task = clientOwner.rpc("create_invoice_and_deduct_stock", {
        p_store_id: storeId,
        p_invoice_number: `STRESS-INV-${i}-${randomSuffix}`,
        p_customer_name: `Stress Buyer ${i}`,
        p_customer_phone: "9800000000",
        p_total_amount: 4500,
        p_discount_amount: 0,
        p_paid_amount: 4500,
        p_payment_method: "Fonepay",
        p_items: items
      }).then(res => {
        const duration = Date.now() - start;
        return {
          duration,
          error: res.error,
          success: !res.error
        };
      });

      checkoutPromises.push(task);
    }

    const checkoutResults = await Promise.all(checkoutPromises);

    let deadlockDetected = false;
    let successfulCheckouts = 0;
    let failedCheckouts = 0;

    checkoutResults.forEach((res, index) => {
      runResults.latencies.push(res.duration);
      if (res.success) {
        successfulCheckouts++;
      } else {
        failedCheckouts++;
        const errMsg = res.error?.message || "";
        if (errMsg.toLowerCase().includes("deadlock")) {
          deadlockDetected = true;
          logError(`Checkout ${index} failed due to DEADLOCK exception (code 40P01): ${errMsg}`);
        } else {
          logWarning(`Checkout ${index} failed: ${errMsg}`);
        }
      }
    });

    logInfo(`Concurrent checkout waves complete.`);
    logInfo(`Successful transactions: ${green}${successfulCheckouts}/${concurrencyThreshold}${reset}`);
    logInfo(`Failed transactions: ${red}${failedCheckouts}/${concurrencyThreshold}${reset}`);

    if (deadlockDetected) {
      logError("VULNERABILITY DETECTED: Concurrent transactions caused database deadlock exceptions.");
    } else {
      runResults.deadlockPrevention = true;
      logSuccess("CONCURRENCY SEALED: Alphabetized database locking queues prevented 100% of deadlocks!");
    }

    // =========================================================================
    // STRESS TEST 2: CASHIER PRIVILEGE ESCALATION ATTACK FLOOD
    // =========================================================================
    logHeader("Stress Test 2: Cashier Privilege Escalation Flood Attack");
    if (!adminClient) {
      logWarning("Skipping Cashier Privilege Escalation flood (SUPABASE_SERVICE_ROLE_KEY missing).");
    } else {
      logInfo("Flooding product upsert RPC from Cashier session concurrently...");
      const floodAttempts = envInt("AUDIT_PRIVILEGE_FLOOD_COUNT", 20);
      const attackPromises: PromiseLike<{ error: { message: string } | null }>[] = [];

      for (let i = 0; i < floodAttempts; i++) {
        attackPromises.push(
          clientCashier.rpc("upsert_product_and_variants", {
            p_product_id: null,
            p_name: `Hacked Clothing ${i}`,
            p_category: "Tops",
            p_low_stock_threshold: 5,
            p_deleted_variant_ids: [],
            p_variants: [
              { size: "Free", color: "Gold", sku: `HACK-SKU-${i}-${randomSuffix}`, price: 100, stock: 100 }
            ]
          })
        );
      }

      const attackResults = await Promise.all(attackPromises);
      let totalBlocked = 0;

      attackResults.forEach((res) => {
        if (res.error && res.error.message.includes("Only store owners can add or modify products")) {
          totalBlocked++;
        }
      });

      logInfo(`Attack flood complete. Blocked attempts: ${green}${totalBlocked}/${floodAttempts}${reset}`);
      
      const { data: dbProducts } = await adminClient.from("products").select("*").eq("store_id", storeId);
      const injectedProductsCount = dbProducts?.length ? dbProducts.length - 1 : 0; // Exclude the valid Kurti

      if (totalBlocked === floodAttempts && injectedProductsCount === 0) {
        runResults.privilegeEscalationRejected = true;
        logSuccess("SECURITY SHIELDED: RPC Owner Gate successfully repelled 100% of injection attempts!");
      } else {
        logError(`VULNERABILITY DETECTED: Cashier injected ${injectedProductsCount} products into the store!`);
      }
    }

    // =========================================================================
    // STRESS TEST 3: CHECKOUT PRICE TAMPERING INTEGRITY ATTACK
    // =========================================================================
    logHeader("Stress Test 3: Checkout Price Tampering Integrity Attack");
    logInfo("Simulating compromised checkout request altering invoice totals...");
    logInfo(`Attempting to checkout Kurti (priced Rs. 2000) for ${red}Rs. 100${reset}...`);

    const { error: errTamper } = await clientOwner.rpc("create_invoice_and_deduct_stock", {
      p_store_id: storeId,
      p_invoice_number: `TAMPERED-INV-${randomSuffix}`,
      p_customer_name: "Hacker Client",
      p_customer_phone: "9800000000",
      p_total_amount: 100, // Falsified total
      p_discount_amount: 0,
      p_paid_amount: 100,
      p_payment_method: "Cash",
      p_items: [
        {
          variant_id: var1Id,
          quantity: 1,
          unit_price: 100, // Tampered unit price
          subtotal: 100
        }
      ]
    });

    if (errTamper && errTamper.message.includes("Price tampering detected")) {
      runResults.priceTamperingBlocked = true;
      logSuccess("INTEGRITY SEALED: Server-side database trigger aborted and rolled back tampered price checkout!");
    } else {
      logError(`VULNERABILITY DETECTED: Tampered checkouts are accepted by backend: ${errTamper?.message || "Success"}`);
    }

    // Verify stock remains unmodified
    const { data: inventoryCheck } = await clientOwner
      .from("inventory")
      .select("quantity")
      .eq("variant_id", var1Id)
      .single();
    
    // Original stock is 500. Successful checkouts from Test 1 are: successfulCheckouts.
    // Each successful checkout from Test 1 deducted 1 item from var1.
    const expectedStock = 500 - successfulCheckouts;
    if (inventoryCheck && inventoryCheck.quantity === expectedStock) {
      logSuccess(`Inventory stock is intact and holds exactly expected quantity: ${inventoryCheck.quantity}`);
    } else {
      logError(`Stock discrepancy detected! Found: ${inventoryCheck?.quantity}, Expected: ${expectedStock}`);
    }

    // =========================================================================
    // STRESS TEST 4: BRUTE-FORCE WAVE & ANOMALY DETECTION CRON VERIFICATION
    // =========================================================================
    logHeader("Stress Test 4: Brute-Force Auth Flooding & Database pg_cron Scanner");
    if (!adminClient) {
      logWarning("Skipping Brute-Force Anomaly scanner verification (SUPABASE_SERVICE_ROLE_KEY missing).");
    } else {
      logInfo("Flooding unauthenticated brute force sign-ins to activate the anomaly scanner...");
      
      const failedLoginsCount = envInt("AUDIT_FAILED_LOGIN_LOG_COUNT", 12);
      const failedLoginPromises: PromiseLike<{ error: { message: string } | null }>[] = [];

      for (let i = 0; i < failedLoginsCount; i++) {
        // Direct call to write failed auth records securely to the database log drain
        failedLoginPromises.push(
          adminClient.rpc("log_unauthenticated_security_event", {
            p_operation: "AUTH_LOGIN_FAILURE",
            p_affected_entity: `Brute Force Email: target-victim-${randomSuffix}@paisapos.com`,
            p_error_message: "Invalid login credentials."
          })
        );
      }

      await Promise.all(failedLoginPromises);
      logInfo(`Logged ${failedLoginsCount} failed sign-in operations in audit trail logs.`);

      logInfo("Triggering manual execution of threat scanning trigger function: detect_threat_anomalies()...");
      const { error: errCronRun } = await adminClient.rpc("detect_threat_anomalies");
      if (errCronRun) {
        logError(`Failed to trigger database anomaly detection scan: ${errCronRun.message}`);
      } else {
        logSuccess("Database threat anomaly scan completed successfully!");

        logInfo("Querying database security alerts table to see if alarms were flagged...");
        const { data: alerts, error: errAlerts } = await adminClient
          .from("security_alerts")
          .select("*")
          .eq("alert_type", "BRUTE_FORCE_ATTEMPT")
          .order("created_at", { ascending: false });

        if (errAlerts) {
          logError(`Failed to retrieve security alerts: ${errAlerts.message}`);
        } else if (alerts && alerts.length > 0) {
          runResults.bruteForceAnomalyAlerted = true;
          logSuccess(`ALERT TRIGGERED: Threat Scanner logged ${alerts.length} security alerts!`);
          alerts.forEach(a => {
            console.log(`  - ${bright}${red}[ALERT]${reset} Severity: ${a.severity} | ${a.description} (${a.created_at})`);
          });
        } else {
          logError("No threat alerts were logged. Anomaly scanner fails to verify brute-force threshold.");
        }
      }
    }

    // =========================================================================
    // PERFORMANCE REPORTING
    // =========================================================================
    logHeader("Performance & Latency Analysis");
    const latenciesSorted = [...runResults.latencies].sort((a, b) => a - b);
    const count = latenciesSorted.length;

    if (count > 0) {
      const avg = Math.round(latenciesSorted.reduce((sum, val) => sum + val, 0) / count);
      const p50 = latenciesSorted[Math.floor(count * 0.5)];
      const p90 = latenciesSorted[Math.floor(count * 0.9)];
      const p95 = latenciesSorted[Math.floor(count * 0.95)];
      const p99 = latenciesSorted[Math.floor(count * 0.99)];

      console.log(`
${bright}Concurrency Latency Percentiles (based on ${concurrencyThreshold} concurrent checkouts):${reset}
  ┌───────────────┬────────────────────┐
  │ Metric        │ Latency (ms)       │
  ├───────────────┼────────────────────┤
  │ Average       │ ${avg.toString().padEnd(18)} │
  │ p50 (Median)  │ ${p50.toString().padEnd(18)} │
  │ p90           │ ${p90.toString().padEnd(18)} │
  │ p95           │ ${p95.toString().padEnd(18)} │
  │ p99           │ ${p99.toString().padEnd(18)} │
  └───────────────┴────────────────────┘
`);
    } else {
      logWarning("No latency data available.");
    }

  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logError(`Stress suite crashed unexpectedly: ${errMsg}`);
    console.error(err);
  } finally {
    // =========================================================================
    // TEARDOWN & CLEANUP
    // =========================================================================
    logHeader("Clean up & Store Teardown");
    if (adminClient && storeId) {
      logInfo("Initiating clean database cascade teardown of stress testing store...");
      
      const { error: errTeardownStore } = await adminClient.from("stores").delete().eq("id", storeId);
      if (errTeardownStore) {
        logError(`Failed to delete stress store: ${errTeardownStore.message}`);
      } else {
        logSuccess("Stress store record cleanly deleted from database (Cascade success).");
      }

      if (ownerId) {
        await adminClient.from("users").delete().eq("id", ownerId);
      }
      if (cashierId) {
        await adminClient.from("users").delete().eq("id", cashierId);
      }
      logSuccess("Owner and cashier accounts cleanly purged!");
    } else if (clientOwner && storeId) {
      logInfo("Deleting store using owner session...");
      await clientOwner.from("stores").delete().eq("id", storeId);
      await clientOwner.from("users").delete().eq("id", ownerId);
      logSuccess("Owner store record cleanly deleted.");
    }

    await clientOwner.auth.signOut();
    await clientCashier.auth.signOut();
    logInfo("User sessions signed out.");

    // =========================================================================
    // FINAL SECURITY SCORECARD
    // =========================================================================
    logHeader("Final System Security Scorecard");
    const deadlockStatus = runResults.deadlockPrevention ? `${green}SECURE (PASS)${reset}` : `${red}VULNERABLE${reset}`;
    const pricingStatus = runResults.priceTamperingBlocked ? `${green}SECURE (PASS)${reset}` : `${red}VULNERABLE${reset}`;
    
    let privilegeStatus = `${yellow}BYPASSED (No Admin Key)${reset}`;
    if (serviceRoleKey) {
      privilegeStatus = runResults.privilegeEscalationRejected ? `${green}SECURE (PASS)${reset}` : `${red}VULNERABLE${reset}`;
    }

    let alertStatus = `${yellow}BYPASSED (No Admin Key)${reset}`;
    if (serviceRoleKey) {
      alertStatus = runResults.bruteForceAnomalyAlerted ? `${green}SECURE (PASS)${reset}` : `${red}VULNERABLE${reset}`;
    }

    const overallScore = (runResults.deadlockPrevention && runResults.priceTamperingBlocked && 
                          (!serviceRoleKey || (runResults.privilegeEscalationRejected && runResults.bruteForceAnomalyAlerted))) 
                          ? `${bright}${green}A+ / SECURE${reset}` : `${bright}${red}FAIL / HIGH RISK${reset}`;

    console.log(`
┌──────────────────────────────────────────────────────────────────┐
│             🔒   SYSTEM SECURITY AUDIT RATINGS                    │
├──────────────────────────────────┬───────────────────────────────┤
│ Vector Check                     │ Status                        │
├──────────────────────────────────┼───────────────────────────────┤
│ 1. Deadlock Serialization Lock   │ ${deadlockStatus.padEnd(41)} │
│ 2. Cashier RPC Privilege Gate    │ ${privilegeStatus.padEnd(41)} │
│ 3. Pricing Integrity Protection   │ ${pricingStatus.padEnd(41)} │
│ 4. Threat Anomaly Alarm trigger  │ ${alertStatus.padEnd(41)} │
├──────────────────────────────────┴───────────────────────────────┤
│ OVERALL SECURITY POSTURE GRADE:   ${overallScore}                   │
└──────────────────────────────────────────────────────────────────┘
`);
  }
}

main().catch(console.error);
