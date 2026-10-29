/** Increment the final numeric portion, retaining prefixes, suffixes and zero padding. */
export function nextShippingCode(previous: string): string | null {
  const match = previous.trim().match(/^(.*?)(\d+)(\D*)$/);
  if (!match) return null;
  const next = (BigInt(match[2]) + 1n).toString().padStart(match[2].length, '0');
  const code = `${match[1]}${next}${match[3]}`;
  return code.length <= 2000 ? code : null;
}
