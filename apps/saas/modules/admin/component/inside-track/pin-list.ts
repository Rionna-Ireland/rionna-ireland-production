/**
 * Inside Track "Start Here" pin-list logic (S11-01 Task 6) — pure,
 * framework-free. The admin surface always sends the full ordered list of
 * pinned Circle post ids to `setInsideTrackPins`; these helpers compute the
 * next list for pin / unpin / reorder actions.
 */

export function pinAdd(list: string[], id: string): string[] {
	return list.includes(id) ? list : [...list, id];
}

export function pinRemove(list: string[], id: string): string[] {
	return list.filter((x) => x !== id);
}

export function pinMove(list: string[], id: string, direction: -1 | 1): string[] {
	const from = list.indexOf(id);
	const to = from + direction;
	if (from === -1 || to < 0 || to >= list.length) return list;
	const next = [...list];
	next[from] = next[to];
	next[to] = id;
	return next;
}
