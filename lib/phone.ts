/**
 * phone.ts — Shared Indian mobile-number helpers
 *
 * Rules (applied on every keystroke / paste):
 *  1. Strip everything except digits.
 *  2. If the raw value starts with country code (91) and has > 10 digits, drop the leading 91.
 *  3. Keep at most 10 digits.
 *
 * Validation:
 *  - Exactly 10 digits.
 *  - First digit must be 6, 7, 8, or 9 (valid Indian mobile prefix).
 */

/**
 * sanitizePhone — normalises a raw input string to at most 10 Indian digits.
 * Safe to call on every onChange event.
 */
export function sanitizePhone(raw: string): string {
  // Remove everything except digits
  let digits = raw.replace(/\D/g, "");

  // If user pasted +91XXXXXXXXXX (12 digits starting with 91) → strip country code
  if (digits.length > 10 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }

  // Enforce max 10 digits
  return digits.slice(0, 10);
}

/**
 * isValidIndianPhone — returns true only if the value is a valid 10-digit
 * Indian mobile number (starts with 6, 7, 8, or 9).
 */
export function isValidIndianPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 && /^[6-9]/.test(digits);
}
