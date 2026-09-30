/**
 * The anchor of a heading, the same in every web view: lowercase, accents
 * stripped, and every run of characters other than a–z and 0–9 one hyphen,
 * none at either end ("Café & Bar" → "cafe-bar").
 */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
