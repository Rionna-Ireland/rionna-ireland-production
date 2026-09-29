/**
 * Minimal CSV builder for admin exports (S12-09 waitlist, S12-10 HRI export).
 *
 * - UTF-8 BOM so Excel renders fadas (Seán, Ó Súilleabháin) correctly.
 * - CRLF line endings and RFC 4180 quoting (fields containing `"`, `,`, CR or
 *   LF are wrapped in quotes, embedded quotes doubled).
 * - Formula-injection guard: cells starting with `=`, `+`, `-`, `@`, tab or CR
 *   are prefixed with `'` so spreadsheet apps treat them as text. Values are
 *   user-supplied (names) and the file is opened in Excel.
 * - `Date` values are serialised as ISO 8601; `null` / `undefined` as empty.
 */

export type CsvCellValue = string | number | Date | null | undefined;

export interface CsvColumn<T> {
	header: string;
	value: (row: T) => CsvCellValue;
}

const UTF8_BOM = "﻿";
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const NEEDS_QUOTING = /[",\r\n]/;

function stringifyCell(value: CsvCellValue): string {
	if (value === null || value === undefined) {
		return "";
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	return String(value);
}

/** Escape one already-stringified cell: formula guard, then RFC 4180 quoting. */
export function escapeCsvCell(raw: string): string {
	const guarded = FORMULA_TRIGGER.test(raw) ? `'${raw}` : raw;
	return NEEDS_QUOTING.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: readonly T[]): string {
	const lines = [
		columns.map((column) => escapeCsvCell(column.header)).join(","),
		...rows.map((row) =>
			columns.map((column) => escapeCsvCell(stringifyCell(column.value(row)))).join(","),
		),
	];
	return `${UTF8_BOM}${lines.join("\r\n")}\r\n`;
}
