"use client";

import { useEffect, useState } from "react";

/** False on the server and first paint; true after mount unless Reduce Motion or Save-Data. */
export function useMotionOk(): boolean {
	const [ok, setOk] = useState(false);
	useEffect(() => {
		const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } })
			.connection?.saveData;
		setOk(!window.matchMedia("(prefers-reduced-motion: reduce)").matches && !saveData);
	}, []);
	return ok;
}
