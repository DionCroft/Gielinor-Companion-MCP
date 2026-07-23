export function formatNumber(value: number | undefined): string {
  return value === undefined ? "Unknown" : new Intl.NumberFormat("en-GB").format(value);
}

export function formatGp(value: number | undefined): string {
  if (value === undefined) {
    return "Unknown";
  }
  const absolute = Math.abs(value);
  const formatted =
    absolute >= 1_000_000_000
      ? `${(value / 1_000_000_000).toFixed(2)}b`
      : absolute >= 1_000_000
        ? `${(value / 1_000_000).toFixed(2)}m`
        : absolute >= 1_000
          ? `${(value / 1_000).toFixed(1)}k`
          : String(value);
  return `${formatted} GP`;
}

export function formatDate(value: string | undefined): string {
  if (value === undefined) {
    return "Not yet";
  }
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Unknown"
    : new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function titleCase(value: string): string {
  return value
    .split("-")
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
