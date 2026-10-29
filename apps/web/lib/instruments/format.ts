// Number forms the instruments show: a signed figure with a true minus sign, a share as a per cent, and whole
// metres with a thousands separator.

export const signed = (v: number, digits: number) =>
  `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(digits)}`;

export const percent = (share: number, digits = 1) => `${(share * 100).toFixed(digits)}%`;

const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

export const metres = (v: number) => whole.format(v);
