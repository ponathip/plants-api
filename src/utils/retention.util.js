export function getRetentionDate(deletedAt, days) {
  const date = new Date(deletedAt);
  date.setDate(date.getDate() + days);
  return date;
}