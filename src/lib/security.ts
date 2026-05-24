import type { ZodError } from "zod";


/**
 * Sanitizes a string by removing control characters, stripping HTML tags,
 * and trimming whitespace. This helps prevent XSS and script injection.
 */
export function sanitizeString(val: string): string {
  if (typeof val !== "string") return "";

  // 1. Remove control characters (Unicode range U+0000 - U+001F and U+007F - U+009F)
  let clean = val.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

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
  const clean = sanitizeString(val);
  
  if (clean.startsWith("=") || clean.startsWith("+") || clean.startsWith("-") || clean.startsWith("@")) {
    return `'${clean}`;
  }
  
  return clean;
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
  if (err instanceof Error) {
    message = err.message;
  } else if (typeof err === "string") {
    message = err;
  } else if (typeof err === "object" && err !== null && "message" in err) {
    message = String((err as { message: unknown }).message);
  } else {
    message = String(err);
  }

  const lowercaseMsg = message.toLowerCase();

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

  // 5. Network / Database / Server Action / Fetch failures
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

  // Fallback to a clean general message
  if (lowercaseMsg.includes("an error occurred in the server action") || 
      lowercaseMsg.includes("internal server error")) {
    return "An error occurred on the server. Please try again in a moment.";
  }

  return message;
}
