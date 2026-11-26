// Whether any plugin is still loading: Play waits, and the canvas shows LOADING.
// A node with no status yet counts as loading (the engine has not reached it). 'error' does not count,
// so one broken plugin never locks the transport.

export function anyLoading(
  nodes: readonly { id: string }[],
  status: Readonly<Record<string, string>>,
): boolean {
  return nodes.some((n) => (status[n.id] ?? 'loading') === 'loading');
}
