import type { ZodError } from "zod";

export const MAX_EMAIL_LENGTH = 254;
export const MAX_PASSWORD_LENGTH = 256;

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F-\u009F]/;

export function hasControlCharacters(val: string): boolean {
  return CONTROL_CHARACTER_PATTERN.test(val);
}

export function normalizeEmail(val: string): string {
  if (typeof val !== "string") return "";
  return val.normalize("NFKC").trim().toLowerCase();
}

export function validateAuthStringSafety(val: string): boolean {
  return !hasControlCharacters(val);
}

export function validatePasswordComplexity(val: string): boolean {
  return /[a-z]/.test(val) && /[A-Z]/.test(val) && /\d/.test(val);
}

/**
 * Sanitizes a string by removing control characters, stripping HTML tags,
 * and trimming whitespace. This helps prevent XSS and script injection.
 */
export function sanitizeString(val: string): string {
  if (typeof val !== "string") return "";

  const normalized = val.normalize("NFKC");

  // 1. Remove control characters (Unicode range U+0000 - U+001F and U+007F - U+009F)
  let clean = normalized.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

  // 2. Strip standard HTML and script tags to prevent Cross-Site Scripting (XSS)
  clean = clean.replace(/<[^>]*>/g, "");

  // 3. Trim extra whitespace
  return clean.trim();
}

/**
 * Escapes spreadsheet formula prefixes to prevent CSV/Excel Formula Injection.
 * Excel/Google Sheets execute strings starting with =, +, -, @ as formulas.
 * We escape them by prepending a single quote (').
 */
export function sanitizeCSVCell(val: string): string {
  if (typeof val !== "string") return "";

  const normalized = val.normalize("NFKC");
  // Remove control characters except tab (\t), newline (\n), and carriage return (\r)
  let clean = normalized.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "");
  // Strip standard HTML and script tags to prevent Cross-Site Scripting (XSS)
  clean = clean.replace(/<[^>]*>/g, "");
  const trimmed = clean.trim();

  if (trimmed.startsWith("=") || trimmed.startsWith("+") || trimmed.startsWith("-") || trimmed.startsWith("@")) {
    return `'${trimmed}`;
  }

  return trimmed;
}

/**
 * Validates a redirect path to prevent Open Redirect vulnerabilities.
 * Assures the path is relative, starting with a single '/' and not protocol-relative (e.g. starting with // or \\).
 */
export function validateRedirectPath(
  path: string | null | undefined,
  defaultPath = "/dashboard"
): string {
  if (!path) return defaultPath;

  const trimmed = path.trim();
  if (trimmed === "") return defaultPath;

  // Enforce relative path starting with a single '/'
  // Protect against '//' or '\\' which browsers resolve as protocol-relative (redirecting to arbitrary domains)
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("\\\\") || trimmed.startsWith("\\")) {
    return defaultPath;
  }

  // Prevent scheme injections like 'javascript:', 'data:', 'http:', 'https:'
  const hasScheme = /^[a-z0-9+.-]+:/i.test(trimmed);
  if (hasScheme) {
    return defaultPath;
  }

  return trimmed;
}

/**
 * Formats a Zod Error into a highly human-readable, user-friendly, comma-separated list of issues.
 * Gracefully humanizes camelCase and snake_case field names and maps list indices to numbered items.
 */
export function formatZodError(error: ZodError): string {
  if (!error || !Array.isArray(error.issues)) return "Validation failed.";

  return error.issues
    .map((issue) => {
      let fieldName = "";

      if (issue.path && issue.path.length > 0) {
        const parts: string[] = [];
        for (let i = 0; i < issue.path.length; i++) {
          const part = issue.path[i];
          if (typeof part === "number") {
            if (parts.length > 0) {
              const last = parts.pop();
              // Singularize: variants -> Variant, items -> Item
              const singular = last ? last.replace(/s$/, "") : "Item";
              parts.push(`${singular} #${part + 1}`);
            } else {
              parts.push(`Item #${part + 1}`);
            }
          } else {
            // Humanize from camelCase or snake_case
            const readable = String(part)
              .replace(/([A-Z])/g, " $1")
              .replace(/[_-]/g, " ")
              .trim();
            // Capitalize first word
            const capitalized = readable.charAt(0).toUpperCase() + readable.slice(1).toLowerCase();
            parts.push(capitalized);
          }
        }
        fieldName = parts.join(" ") + ": ";
      }

      return `${fieldName}${issue.message}`;
    })
    .join(", ");
}

/**
 * Maps raw, technical database/network/auth errors into clean, highly professional, user-friendly messages.
 * Prevents technical jargon or internal server-side errors from leaking to users.
 */
export function getFriendlyErrorMessage(err: unknown): string {
  if (!err) return "An unexpected error occurred. Please try again.";

  let message = "";
  let code = "";
  if (err instanceof Error) {
    message = err.message;
  } else if (typeof err === "string") {
    message = err;
  } else if (typeof err === "object" && err !== null && "message" in err) {
    message = String((err as { message: unknown }).message);
    if ("code" in err) {
      code = String((err as { code?: unknown }).code ?? "");
    }
  } else {
    message = String(err);
  }

  const lowercaseMsg = message.toLowerCase();
  const lowercaseCode = code.toLowerCase();

  // 1. Password complexity / strength mapping
  if (lowercaseMsg.includes("password should contain at least one character of each") || 
      lowercaseMsg.includes("password must contain at least one lowercase")) {
    return "Password must contain at least one lowercase letter, one uppercase letter, and one number.";
  }
  if (lowercaseMsg.includes("password must be at least 8 characters")) {
    return "Password must be at least 8 characters long.";
  }

  // 2. Credentials/Auth failures
  if (lowercaseMsg.includes("invalid login credentials") || 
      lowercaseMsg.includes("user not found") || 
      lowercaseMsg.includes("invalid credentials") ||
      lowercaseMsg.includes("email not found") ||
      lowercaseMsg.includes("password is incorrect")) {
    return "Invalid email or password. Please try again.";
  }

  // 3. Account issues
  if (lowercaseMsg.includes("email not confirmed") || 
      lowercaseMsg.includes("confirm your email")) {
    return "Please confirm your email address before signing in. Check your inbox for the confirmation link.";
  }
  if (lowercaseMsg.includes("user already exists") || 
      lowercaseMsg.includes("email already registered") ||
      lowercaseMsg.includes("already registered") ||
      lowercaseMsg.includes("email_owner_unique") ||
      lowercaseMsg.includes("user already registered")) {
    return "This email address is already registered. Please sign in instead.";
  }
  if (lowercaseMsg.includes("staff account is suspended") || lowercaseMsg.includes("account is suspended")) {
    return "This staff account is suspended. Please contact the store owner.";
  }

  // 4. Rate limiting / abuse
  if (lowercaseMsg.includes("too many requests") || 
      lowercaseMsg.includes("rate limit") || 
      lowercaseMsg.includes("rate_limit_exceeded")) {
    const match = message.match(/(\d+)\s*(second|minute|hour)/i);
    if (match) {
      return `Too many attempts. Please try again in ${match[1]} ${match[2].toLowerCase()}${Number(match[1]) > 1 ? 's' : ''}.`;
    }
    return "Too many attempts. Please try again in a few minutes.";
  }

  // 5. Staff/invite/delegation domain errors
  if (lowercaseMsg.includes("staff_invitation_auth_required")) {
    return "Please sign in with the invited email first.";
  }
  if (lowercaseMsg.includes("staff_invitation_not_found")) {
    return "Invitation not found.";
  }
  if (lowercaseMsg.includes("staff_invitation_not_pending")) {
    return "This invitation is no longer pending.";
  }
  if (lowercaseMsg.includes("staff_invitation_expired")) {
    return "This invitation has expired. Ask the owner to send a new one.";
  }
  if (lowercaseMsg.includes("staff_invitation_email_mismatch")) {
    return "This invite belongs to a different email address.";
  }
  if (lowercaseMsg.includes("staff_invitation_store_conflict")) {
    return "This account is already connected to another store.";
  }
  if (lowercaseMsg.includes("staff_invitation_role_conflict")) {
    return "This invite can only be accepted by a cashier account.";
  }
  if (lowercaseMsg.includes("staff_invitation_store_missing")) {
    return "This invitation is no longer valid. Ask the owner to send a new one.";
  }
  if (
    lowercaseMsg.includes("staff_invitation_pending_register_blocked") ||
    lowercaseMsg.includes("staff_account_cannot_register_store")
  ) {
    return "This account is already connected to a store as staff. Use a different email to create your own shop.";
  }
  if (lowercaseMsg.includes("store_registration_profile_conflict")) {
    return "This account is already connected to a store. Please sign in instead.";
  }
  if (lowercaseMsg.includes("staff_lifecycle_unauthorized") || lowercaseMsg.includes("missing privilege")) {
    return "You do not have permission to update staff access.";
  }
  if (lowercaseMsg.includes("staff_profile_not_found") || lowercaseMsg.includes("cashier profile not found")) {
    return "Cashier profile not found.";
  }
  if (lowercaseMsg.includes("staff_already_suspended") || lowercaseMsg.includes("already suspended")) {
    return "This cashier is already suspended.";
  }
  if (lowercaseMsg.includes("staff_already_active") || lowercaseMsg.includes("already active")) {
    return "This cashier is already active.";
  }
  if (lowercaseMsg.includes("staff_self_suspension_denied")) {
    return "Owners cannot suspend their own account.";
  }
  if (lowercaseMsg.includes("delegation_not_found") || lowercaseMsg.includes("temporary access record not found")) {
    return "Temporary access record not found.";
  }
  if (lowercaseMsg.includes("delegation_already_revoked") || lowercaseMsg.includes("already revoked")) {
    return "Temporary access is already revoked.";
  }
  if (lowercaseMsg.includes("stock record was not found")) {
    return "Stock record was not found or is no longer editable.";
  }

  // 6. Duplicate and validation cases that are safe to show
  if (
    lowercaseCode === "23505" ||
    lowercaseMsg.includes("duplicate key") ||
    lowercaseMsg.includes("unique constraint") ||
    lowercaseMsg.includes("product_variants_store_sku_key") ||
    lowercaseMsg.includes("product_variants_sku_key")
  ) {
    return "A record with those details already exists. Please check the value and try again.";
  }
  if (
    lowercaseMsg.includes("invalid checkout payload") ||
    lowercaseMsg.includes("invalid product details") ||
    lowercaseMsg.includes("invalid bulk products details") ||
    lowercaseMsg.includes("invalid store info") ||
    lowercaseMsg.includes("invalid profile details") ||
    lowercaseMsg.includes("validation failed")
  ) {
    return message;
  }

  // 7. Network / Database / Server Action / Fetch failures
  if (lowercaseMsg.includes("fetch failed") || 
      lowercaseMsg.includes("typeerror") || 
      lowercaseMsg.includes("network error") || 
      lowercaseMsg.includes("failed to fetch") || 
      lowercaseMsg.includes("internal server error") ||
      lowercaseMsg.includes("database error") ||
      lowercaseMsg.includes("unexpected character") ||
      lowercaseMsg.includes("connection failed")) {
    return "We are experiencing a temporary server connection issue. Please verify your internet connection and try again in a few moments.";
  }

  // 8. Fallback to a clean general message for framework/server errors
  if (lowercaseMsg.includes("an error occurred in the server action") || 
      lowercaseMsg.includes("internal server error")) {
    return "An error occurred on the server. Please try again in a moment.";
  }

  const technicalPattern = /(postgrest|postgres|supabase|pgrst|sql|database|schema|relation|column|constraint|foreign key|violates|row-level|rls|rpc|function|uuid|json|syntax|stack|trace|server action|failed to fetch|jwt|cookie|session)/i;
  if (!technicalPattern.test(message) && message.length <= 180) {
    return message;
  }

  return "An unexpected error occurred. Please try again.";
}
