/**
 * Rupee amounts as owners type them ("49", "49.50", "1,200") ↔ integer paise for the API.
 * Returns null for anything that is not a valid non-negative amount with ≤ 2 decimals.
 */
export function rupeesToPaise(text: string): number | null {
  const cleaned = text.replace(/[,\s₹]/g, '');
  if (cleaned === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ''] = cleaned.split('.');
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(paise) ? paise : null;
}

/** 4950 → "49.50", 5000 → "50". For pre-filling editable fields. */
export function paiseToRupeesText(paise: number): string {
  const whole = Math.floor(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(whole) : `${whole}.${String(rest).padStart(2, '0')}`;
}
