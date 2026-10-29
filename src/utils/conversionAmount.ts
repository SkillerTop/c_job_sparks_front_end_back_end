export const parseConversionAmount = (value: string) => {
  if (!value.trim()) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const normalizeConversionAmount = (value: string, fallback: number) => {
  if (!value.trim()) return String(fallback);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : String(fallback);
};
