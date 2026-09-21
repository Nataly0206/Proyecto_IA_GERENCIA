export type WeightUnit = 'lbs' | 'kg';

const POUNDS_PER_KILOGRAM = 2.2046226218;

export function convertPounds(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value / POUNDS_PER_KILOGRAM : value;
}
