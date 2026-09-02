export interface VoteCountRow {
	pollId: string;
	optionId: string;
	_count: { _all: number };
}

export function groupVoteCounts(rows: VoteCountRow[]): Record<string, Record<string, number>> {
	const out: Record<string, Record<string, number>> = {};
	for (const row of rows) {
		out[row.pollId] ??= {};
		out[row.pollId][row.optionId] = row._count._all;
	}
	return out;
}
