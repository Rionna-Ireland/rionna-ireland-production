import { describe, expect, it } from "vitest";

import { toCsv, type CsvColumn } from "../csv";

interface Row {
	name: string | null;
	email?: string;
	joinedAt?: Date | null;
	count?: number;
}

const columns: CsvColumn<Row>[] = [
	{ header: "name", value: (row) => row.name },
	{ header: "email", value: (row) => row.email },
];

const BOM = "﻿";

describe("toCsv", () => {
	it("starts with a UTF-8 BOM and uses CRLF line endings", () => {
		const csv = toCsv(columns, [{ name: "Tom", email: "tom@example.com" }]);
		expect(csv.startsWith(BOM)).toBe(true);
		expect(csv).toBe(`${BOM}name,email\r\nTom,tom@example.com\r\n`);
	});

	it("emits only the header row when there are no rows", () => {
		expect(toCsv(columns, [])).toBe(`${BOM}name,email\r\n`);
	});

	it("keeps fadas intact", () => {
		const csv = toCsv(columns, [{ name: "Seán Ó Súilleabháin", email: "sean@example.ie" }]);
		expect(csv).toContain("Seán Ó Súilleabháin,sean@example.ie");
	});

	it("quotes cells with commas, quotes and newlines (RFC 4180)", () => {
		const csv = toCsv(columns, [
			{ name: "Power, Tom", email: 'a"b@example.com' },
			{ name: "line1\nline2", email: "x\r\ny" },
		]);
		expect(csv).toBe(
			`${BOM}name,email\r\n"Power, Tom","a""b@example.com"\r\n"line1\nline2","x\r\ny"\r\n`,
		);
	});

	it("neutralises formula injection", () => {
		const csv = toCsv(
			[{ header: "v", value: (row: { v: string }) => row.v }],
			[
				{ v: '=HYPERLINK("http://evil.example","click")' },
				{ v: "+1" },
				{ v: "-1" },
				{ v: "@SUM(A1)" },
				{ v: "\tx" },
				{ v: "\rx" },
				{ v: "safe=value" },
			],
		);
		const lines = csv.slice(1).split("\r\n");
		expect(lines[1]).toBe(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
		expect(lines[2]).toBe("'+1");
		expect(lines[3]).toBe("'-1");
		expect(lines[4]).toBe("'@SUM(A1)");
		expect(lines[5]).toBe("'\tx");
		expect(lines[6]).toBe(`"'\rx"`);
		expect(lines[7]).toBe("safe=value");
	});

	it("renders null/undefined as empty, dates as ISO and numbers as-is", () => {
		const csv = toCsv(
			[
				{ header: "name", value: (row: Row) => row.name },
				{ header: "email", value: (row: Row) => row.email },
				{ header: "joined", value: (row: Row) => row.joinedAt },
				{ header: "count", value: (row: Row) => row.count },
			],
			[{ name: null, joinedAt: new Date("2026-09-27T10:00:00.000Z"), count: 3 }],
		);
		expect(csv).toBe(`${BOM}name,email,joined,count\r\n,,2026-09-27T10:00:00.000Z,3\r\n`);
	});
});
