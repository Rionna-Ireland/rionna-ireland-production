import { dealDelay } from "@shared/components/pattern/PatternMosaic";

export const CLUB_TZ = "Europe/Dublin";

export type MonthCell = { day: number; key: string } | null;

const dayFmt = new Intl.DateTimeFormat("en-CA", {
	timeZone: CLUB_TZ,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

/** YYYY-MM-DD in the club's timezone, so server and browser agree on the day. */
export function dayKey(value: string | Date): string {
	return dayFmt.format(new Date(value));
}

/** Month grid, Monday first. `month` is 0-based. Leading and trailing blanks are null. */
export function monthCells(year: number, month: number): MonthCell[] {
	const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
	const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	const mm = String(month + 1).padStart(2, "0");
	const cells: MonthCell[] = Array.from({ length: lead }, () => null);
	for (let day = 1; day <= days; day++) {
		cells.push({ day, key: `${year}-${mm}-${String(day).padStart(2, "0")}` });
	}
	while (cells.length % 7) cells.push(null);
	return cells;
}

/** Diagonal deal delay (ms) of a day cell on the 7 column grid. */
export function cellDealDelay(index: number): number {
	return dealDelay(index, 7);
}
