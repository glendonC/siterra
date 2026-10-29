// Number forms the instruments show: a signed figure with a true minus sign, a share as a per cent, whole metres
// with a thousands separator, and dates as "11 Jun 2025" (docs/reference/voice-and-tone.md).

export const signed = (v: number, digits: number) =>
  `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(digits)}`;

export const percent = (share: number, digits = 1) => `${(share * 100).toFixed(digits)}%`;

const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

export const metres = (v: number) => whole.format(v);

/** A figure with a true minus sign and no plus; one that rounds to zero has no sign. */
export const fixed = (v: number, digits: number) => {
  const a = Math.abs(v).toFixed(digits);
  return v < 0 && Number(a) !== 0 ? `−${a}` : a;
};

/** A change: signed, except one that rounds to zero. */
export const change = (v: number, digits: number) => {
  const a = Math.abs(v).toFixed(digits);
  return Number(a) === 0 ? a : `${v < 0 ? "−" : "+"}${a}`;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** An ISO date or date-time as "11 Jun 2025". */
export const day = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${String(d)} ${MONTHS[(m ?? 1) - 1] ?? ""} ${String(y)}`;
};
