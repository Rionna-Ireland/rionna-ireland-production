/**
 * Keyset pagination cursor for inbox.list: opaque base64url encoding of the
 * last row's (updatedAt, id) so paging is stable under concurrent inserts.
 */
export function encodeCursor(row: { updatedAt: Date; id: string }): string {
	return Buffer.from(`${row.updatedAt.toISOString()}|${row.id}`).toString("base64url");
}

export function decodeCursor(cursor: string): { updatedAt: Date; id: string } | null {
	const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
	const updatedAt = iso ? new Date(iso) : null;
	if (!updatedAt || Number.isNaN(updatedAt.getTime()) || !id) return null;
	return { updatedAt, id };
}
