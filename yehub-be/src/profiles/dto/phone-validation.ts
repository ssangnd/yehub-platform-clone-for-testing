// Optional international phone format. Accepts an empty string OR a number
// with 7-15 digits, an optional leading "+", and spaces/dashes/dots/parens
// as separators. The lookahead enforces the digit count without a separate
// runtime helper.
export const PHONE_REGEX = /^(?:\+?(?=(?:\D*\d){7,15}\D*$)[0-9 \-.()]+)?$/;

export const PHONE_ERROR_MESSAGE =
  'Invalid phone number. Use 7–15 digits with optional country code (e.g. +84 912 345 678).';
