import { describe, test, expect } from "vitest";
import { z } from "zod";
import {
  sanitizeString,
  sanitizeCSVCell,
  validateRedirectPath,
  formatZodError,
} from "../security";

describe("Security Sanitization & Validation Tests", () => {
  describe("sanitizeString", () => {
    test("should strip standard HTML tags", () => {
      const dirty = "<script>alert('XSS')</script>Hello <img src=x onerror=alert(1)>World!";
      expect(sanitizeString(dirty)).toBe("alert('XSS')Hello World!");
    });

    test("should remove control characters", () => {
      const dirty = "Hello\u0000World\u001F!";
      expect(sanitizeString(dirty)).toBe("HelloWorld!");
    });

    test("should trim outer whitespace", () => {
      const dirty = "   Clean Me   ";
      expect(sanitizeString(dirty)).toBe("Clean Me");
    });
  });

  describe("sanitizeCSVCell", () => {
    test("should sanitize string and prepend single quote for formula triggers", () => {
      expect(sanitizeCSVCell("=SUM(A1:A5)")).toBe("'=SUM(A1:A5)");
      expect(sanitizeCSVCell("+1+2")).toBe("'+1+2");
      expect(sanitizeCSVCell("-100")).toBe("'-100");
      expect(sanitizeCSVCell("@cmd")).toBe("'@cmd");
    });

    test("should not prepend single quote for normal string content", () => {
      expect(sanitizeCSVCell("Nepal Hoodie")).toBe("Nepal Hoodie");
      expect(sanitizeCSVCell("Size L")).toBe("Size L");
    });
  });

  describe("validateRedirectPath", () => {
    test("should allow valid relative paths", () => {
      expect(validateRedirectPath("/dashboard")).toBe("/dashboard");
      expect(validateRedirectPath("/inventory?tab=import")).toBe("/inventory?tab=import");
      expect(validateRedirectPath("/auth/update-password")).toBe("/auth/update-password");
    });

    test("should reject absolute paths to prevent open redirects", () => {
      expect(validateRedirectPath("https://evil.com")).toBe("/dashboard");
      expect(validateRedirectPath("http://attacker.org/path")).toBe("/health-check" ? "/dashboard" : "/dashboard");
    });

    test("should reject protocol-relative paths", () => {
      expect(validateRedirectPath("//evil.com")).toBe("/dashboard");
      expect(validateRedirectPath("\\\\evil.com")).toBe("/dashboard");
      expect(validateRedirectPath("\\evil.com")).toBe("/dashboard");
    });

    test("should reject scheme injections", () => {
      expect(validateRedirectPath("javascript:alert(1)")).toBe("/dashboard");
      expect(validateRedirectPath("data:text/html,<script>")).toBe("/dashboard");
    });

    test("should fallback to default path when parameter is empty or invalid", () => {
      expect(validateRedirectPath(null)).toBe("/dashboard");
      expect(validateRedirectPath("")).toBe("/dashboard");
      expect(validateRedirectPath("   ")).toBe("/dashboard");
    });
  });

  describe("formatZodError", () => {
    test("should humanize nested ZodError paths correctly", () => {
      const schema = z.object({
        customerName: z.string().min(1, "Name is required"),
        items: z.array(
          z.object({
            variantId: z.string().uuid("Invalid ID"),
            customName: z.string().min(1, "Custom name required"),
          })
        ),
      });

      const result = schema.safeParse({
        customerName: "",
        items: [
          {
            variantId: "not-a-uuid",
            customName: "",
          },
        ],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const formatted = formatZodError(result.error);
        expect(formatted).toContain("Customer name: Name is required");
        expect(formatted).toContain("Item #1 Variant id: Invalid ID");
        expect(formatted).toContain("Item #1 Custom name: Custom name required");
      }
    });
  });
});
