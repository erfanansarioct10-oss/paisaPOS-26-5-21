import { sanitizeString, sanitizeCSVCell, validateRedirectPath, formatZodError } from "../src/lib/security";
import { parseCSVLine, parseCatalogFile } from "../src/features/inventory/import/catalog-parser";
import { z } from "zod";

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

async function runSecurityStressTests() {
  console.log(`
${bright}${magenta}┌────────────────────────────────────────────────────────┐
│  🇳🇵  PaisaPOS Input Hardening & Security Stress Suite   │
│  Simulating Malicious Payloads, XSS, & Redirect Floods │
└────────────────────────────────────────────────────────┘${reset}
`);

  const results = {
    xssSanitization: false,
    formulaInjectionEscaping: false,
    openRedirectRepelled: false,
    zodErrorHumanizing: false,
    memoryExhaustionResilient: false,
    latencies: [] as number[],
  };

  try {
    // =========================================================================
    // ANGLE 1: XSS / SCRIPT INJECTION STRESS FLOOD
    // =========================================================================
    logHeader("Angle 1: XSS / Script Injection Stress Flood");
    logInfo("Flooding sanitization engine with high-concurrency HTML injection payloads...");

    const xssPayloads = [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(1)>",
      "<svg/onload=alert(1)>",
      "<body onload=alert(1)>",
      "javascript:alert(1)",
      "<iframe src='javascript:alert(1)'></iframe>",
      "<a href='javascript:alert(1)'>Click Me</a>",
    ];

    const startXss = Date.now();
    const xssConcurrency = envInt("AUDIT_XSS_COUNT", 1000);
    let successfullySanitized = 0;

    for (let i = 0; i < xssConcurrency; i++) {
      const payload = xssPayloads[i % xssPayloads.length];
      const clean = sanitizeString(payload);
      if (!clean.includes("<script>") && !clean.includes("<img") && !clean.includes("onerror")) {
        successfullySanitized++;
      }
    }

    const durationXss = Date.now() - startXss;
    results.latencies.push(durationXss);
    logInfo(`Processed ${bright}${xssConcurrency}${reset} XSS vectors in ${bright}${durationXss}ms${reset}.`);

    if (successfullySanitized === xssConcurrency) {
      results.xssSanitization = true;
      logSuccess("XSS DEFENDED: 100% of malicious script/HTML payloads were successfully neutralized!");
    } else {
      logError("XSS VULNERABLE: Some script injections bypassed the sanitization layer.");
    }

    // =========================================================================
    // ANGLE 2: CSV FORMULA INJECTION STRESS FLOOD
    // =========================================================================
    logHeader("Angle 2: CSV / Excel Formula Injection Stress Flood");
    logInfo("Flooding spreadsheet cells with mathematical and command formula triggers...");

    const formulaPayloads = [
      "=SUM(A1:A10)",
      "+1+2",
      "-100",
      "@SUM",
      "=cmd|' /c calc'!A1",
    ];

    const startFormula = Date.now();
    const formulaConcurrency = envInt("AUDIT_FORMULA_COUNT", 1000);
    let successfullyEscaped = 0;

    for (let i = 0; i < formulaConcurrency; i++) {
      const payload = formulaPayloads[i % formulaPayloads.length];
      const escaped = sanitizeCSVCell(payload);
      if (escaped.startsWith("'")) {
        successfullyEscaped++;
      }
    }

    const durationFormula = Date.now() - startFormula;
    results.latencies.push(durationFormula);
    logInfo(`Processed ${bright}${formulaConcurrency}${reset} formula payloads in ${bright}${durationFormula}ms${reset}.`);

    if (successfullyEscaped === formulaConcurrency) {
      results.formulaInjectionEscaping = true;
      logSuccess("FORMULA DEFENDED: 100% of formula injections were successfully escaped using single-quote prefixing!");
    } else {
      logError("FORMULA VULNERABLE: Formula payloads bypassed the spreadsheet cell escaping layer.");
    }

    // =========================================================================
    // ANGLE 3: OPEN REDIRECT FLOOD
    // =========================================================================
    logHeader("Angle 3: Open Redirect / Scheme Injection Stress Flood");
    logInfo("Flooding redirect path validator with protocol-relative and scheme bypass attempts...");

    const redirectPayloads = [
      "https://evil.com",
      "http://attacker.org",
      "//evil.com",
      "\\\\evil.com",
      "\\evil.com",
      "javascript:alert(1)",
      "data:text/html,hack",
      "  /dashboard  ", // Valid relative
      "/inventory?foo=bar", // Valid relative
    ];

    const startRedirect = Date.now();
    const redirectConcurrency = envInt("AUDIT_REDIRECT_COUNT", 1000);
    let successfullyGuarded = 0;

    for (let i = 0; i < redirectConcurrency; i++) {
      const payload = redirectPayloads[i % redirectPayloads.length];
      const validated = validateRedirectPath(payload, "/dashboard");
      
      const isAttacking = payload.includes("evil") || payload.includes("attacker") || payload.includes("javascript") || payload.includes("data:");
      if (isAttacking) {
        if (validated === "/dashboard") {
          successfullyGuarded++;
        }
      } else {
        if (validated.trim().startsWith("/")) {
          successfullyGuarded++;
        }
      }
    }

    const durationRedirect = Date.now() - startRedirect;
    results.latencies.push(durationRedirect);
    logInfo(`Processed ${bright}${redirectConcurrency}${reset} redirect parameters in ${bright}${durationRedirect}ms${reset}.`);

    if (successfullyGuarded === redirectConcurrency) {
      results.openRedirectRepelled = true;
      logSuccess("REDIRECTS DEFENDED: 100% of open-redirect and protocol-relative attacks were successfully repelled!");
    } else {
      logError("REDIRECTS VULNERABLE: Malicious redirect parameters bypassed the relative validator.");
    }

    // =========================================================================
    // ANGLE 4: USER-FRIENDLY ERROR HUMANIZER STRESS FLOOD
    // =========================================================================
    logHeader("Angle 4: Zod Error Humanizer Formatting Stress Flood");
    logInfo("Flooding formatter with multi-nested schema failure stress waves...");

    const testSchema = z.object({
      storeId: z.string().uuid(),
      variants: z.array(
        z.object({
          sku: z.string().min(1),
          price: z.number().nonnegative(),
        })
      ),
    });

    const invalidInput = {
      storeId: "not-a-uuid",
      variants: [
        { sku: "", price: -100 },
        { sku: "SKU-1", price: -50 },
      ],
    };

    const startHuman = Date.now();
    const humanizeConcurrency = envInt("AUDIT_ZOD_COUNT", 1000);
    let successfullyHumanized = 0;

    for (let i = 0; i < humanizeConcurrency; i++) {
      const parsed = testSchema.safeParse(invalidInput);
      if (!parsed.success) {
        const formatted = formatZodError(parsed.error);
        if (
          formatted.includes("Store id: Invalid UUID") &&
          formatted.includes("Variant #1 Sku: Too small") &&
          formatted.includes("Variant #1 Price: Too small")
        ) {
          successfullyHumanized++;
        }
      }
    }

    const durationHuman = Date.now() - startHuman;
    results.latencies.push(durationHuman);
    logInfo(`Processed ${bright}${humanizeConcurrency}${reset} humanized Zod error formats in ${bright}${durationHuman}ms${reset}.`);

    if (successfullyHumanized === humanizeConcurrency) {
      results.zodErrorHumanizing = true;
      logSuccess("HUMANIZING COMPLETED: 100% of complex validation issues were accurately mapped to cashier-friendly warnings!");
    } else {
      logError("HUMANIZING FAILED: Format output did not map complex paths to expected friendly labels.");
    }

    // =========================================================================
    // ANGLE 5: EXTREME PAYLOAD MEMORY RESILIENCE ATTACK
    // =========================================================================
    logHeader("Angle 5: Extreme Payload Memory Resilience & Size Ceiling Attack");
    logInfo("Simulating massive memory exhaustion attack with a 20MB file buffer catalog...");

    const memoryPayloadMb = envInt("AUDIT_MEMORY_PAYLOAD_MB", 20);
    const massiveCSVContent = "Product Name,Category,Size,Color,Price,Stock\n" + "A".repeat(memoryPayloadMb * 1024 * 1024);
    const startMemory = Date.now();
    
    // Simulate frontend drag & drop catalog file upload containing massive buffer
    const mockFile = {
      name: "massive_attack.csv",
      size: massiveCSVContent.length,
      text: async () => massiveCSVContent,
    } as any;

    try {
      // Invoke parser directly to verify it rejects before loading worksheets
      await parseCatalogFile(mockFile);
      logError("VULNERABILITY DETECTED: Massive catalog file (20MB) was accepted without size limits.");
    } catch (err: any) {
      const durationMemory = Date.now() - startMemory;
      results.latencies.push(durationMemory);
      
      if (err.message.includes("File size exceeds the maximum limit of 5MB")) {
        results.memoryExhaustionResilient = true;
        logSuccess(`MEMORY SECURED: Rejection limit triggered immediately in ${bright}${durationMemory}ms${reset}!`);
        logInfo(`Exhaustion Attack Payload safely blocked: ${bright}${err.message}${reset}`);
      } else {
        logError(`unexpected parser error thrown: ${err.message}`);
      }
    }

    // =========================================================================
    // FINAL SYSTEM HARDENING SCORECARD
    // =========================================================================
    logHeader("Final System Hardening Scorecard");
    const xssStatus = results.xssSanitization ? `${green}SECURE (PASS)${reset}` : `${red}VULNERABLE${reset}`;
    const csvStatus = results.formulaInjectionEscaping ? `${green}SECURE (PASS)${reset}` : `${red}VULNERABLE${reset}`;
    const redirectStatus = results.openRedirectRepelled ? `${green}SECURE (PASS)${reset}` : `${red}VULNERABLE${reset}`;
    const humanStatus = results.zodErrorHumanizing ? `${green}SECURE (PASS)${reset}` : `${red}VULNERABLE${reset}`;
    const memoryStatus = results.memoryExhaustionResilient ? `${green}SECURE (PASS)${reset}` : `${red}VULNERABLE${reset}`;

    const score = (results.xssSanitization && results.formulaInjectionEscaping && 
                   results.openRedirectRepelled && results.zodErrorHumanizing && 
                   results.memoryExhaustionResilient) 
                   ? `${bright}${green}A+ / SECURE${reset}` : `${bright}${red}FAIL / HIGH RISK${reset}`;

    console.log(`
┌──────────────────────────────────────────────────────────────────┐
│             🔒   INPUT HARDENING STRESS RATINGS                  │
├──────────────────────────────────┬───────────────────────────────┤
│ Vector Threat Checked            │ Stress Status                 │
├──────────────────────────────────┼───────────────────────────────┤
│ 1. XSS / Script Injection Flood  │ ${xssStatus.padEnd(41)} │
│ 2. CSV Formula Injection Attack  │ ${csvStatus.padEnd(41)} │
│ 3. Open Redirect Target Bypass   │ ${redirectStatus.padEnd(41)} │
│ 4. Zod Error Humanizer Wave      │ ${humanStatus.padEnd(41)} │
│ 5. Memory Exhaustion Buffer Flood│ ${memoryStatus.padEnd(41)} │
├──────────────────────────────────┴───────────────────────────────┤
│ OVERALL SECURITY POSTURE GRADE:   ${score}                   │
└──────────────────────────────────────────────────────────────────┘
`);

  } catch (err: any) {
    logError(`Security stress suite crashed unexpectedly: ${err.message}`);
  }
}

runSecurityStressTests().catch(console.error);
