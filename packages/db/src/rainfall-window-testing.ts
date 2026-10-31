// Test helper: the rainfall window of a place, read from its long-record trend bundle.

/** The rainfall window a long-record trend bundle states as primary, in the spec's fixed words. */
export function statedRainfallWindow(restrend: {
  primary: { rainfall_window: string };
  windows: {
    rainfall: {
      id: string;
      start: { month: number; yearOffset: number };
      end: { month: number; yearOffset: number };
    }[];
  };
}) {
  const names = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const entry = restrend.windows.rainfall.find((w) => w.id === restrend.primary.rainfall_window);
  if (!entry) throw new Error("the bundle states no primary rainfall window");
  const point = (p: { month: number; yearOffset: number }) => ({
    month: names[p.month - 1],
    year: p.yearOffset === -1 ? "previous_year" : "same_year",
  });
  return { id: entry.id, start: point(entry.start), end: point(entry.end) };
}
