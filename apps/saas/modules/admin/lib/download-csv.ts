/**
 * Triggers a browser download of a server-built CSV string (S12-09 / S12-10
 * admin exports). The CSV already carries its UTF-8 BOM.
 */
export function downloadCsv(filename: string, csv: string): void {
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	// Revoke on the next tick so the download has started.
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
