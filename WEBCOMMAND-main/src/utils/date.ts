/**
 * Formats a Date object or ISO timestamp string into Indian Standard Time (IST) format: DD/MM/YYYY, HH:MM:SS.
 */
export function formatToIST(dateInput: Date | string): string {
  if (!dateInput) return "";
  try {
    const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    return date.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch (e) {
    return String(dateInput);
  }
}

/**
 * Formats a Date object or ISO timestamp string into short IST time format: DD/MM/YYYY, HH:MM.
 */
export function formatToISTShort(dateInput: Date | string): string {
  if (!dateInput) return "";
  try {
    const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    return date.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch (e) {
    return String(dateInput);
  }
}
