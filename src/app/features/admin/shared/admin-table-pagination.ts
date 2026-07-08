/** Admin management tables (customers, drivers, orders). */
export const ADMIN_TABLE_PAGE_SIZE = 20;

export function nextAdminTableVisibleCount(current: number, total: number): number {
  return Math.min(current + ADMIN_TABLE_PAGE_SIZE, total);
}
