export const quarterForDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
};

export const quarterOrder = (quarter: string) => {
  const match = /^Q([1-4]) (\d{4})$/.exec(quarter);
  return match ? Number(match[2]) * 4 + Number(match[1]) : 0;
};

export const quarterEndDate = (quarter: string) => {
  const match = /^Q([1-4]) (\d{4})$/.exec(quarter);
  if (!match) return null;
  const quarterNumber = Number(match[1]);
  const year = Number(match[2]);
  return new Date(Date.UTC(year, quarterNumber * 3, 0));
};

export const quarterEndLabel = (quarter: string) => {
  const date = quarterEndDate(quarter);
  return date
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
    : quarter;
};

export const todayIso = () => {
  return new Date().toISOString().slice(0, 10);
};

export const isValidIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
