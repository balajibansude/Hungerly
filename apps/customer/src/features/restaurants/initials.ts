const SKIPPED_WORDS = new Set(['the', 'and', 'of', '&']);

/**
 * Monogram for a restaurant without a logo: "Tandoor & Tales" → "TT",
 * "The Dosa Republic" → "DR", "Bowl Theory" → "BT". Falls back to the first letter of the
 * full name when every word is skipped, and to "" for an empty name.
 */
export function restaurantInitials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  const meaningful = words.filter((word) => !SKIPPED_WORDS.has(word.toLowerCase()));
  const source = meaningful.length > 0 ? meaningful : words;
  return source
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}
