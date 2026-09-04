// Obvious contact details are blanked before a child's writing goes to the feedback model:
// email addresses, Australian phone numbers and street addresses. The child's copy on the
// iPad is untouched.
export function minimiseContactDetails(text) {
  return String(text || "")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/(?:\+?61|0)[2-9](?:[ -]?\d){8}\b/g, "[phone number]")
    .replace(
      /\b\d{1,5}[a-z]?(?:\/\d+)? [A-Z][a-z]+(?: [A-Z][a-z]+)* (?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Crescent|Cres|Place|Pl|Lane|Ln|Way|Parade|Pde|Close|Cl|Highway|Hwy|Terrace|Tce|Boulevard|Blvd)\b\.?/g,
      "[address]",
    );
}
