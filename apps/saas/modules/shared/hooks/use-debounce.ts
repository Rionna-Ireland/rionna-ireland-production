import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value` that only updates after `ms` of inactivity.
 */
export function useDebounce<T>(value: T, ms: number): T {
	const [debounced, setDebounced] = useState(value);

	useEffect(() => {
		const timeout = setTimeout(() => setDebounced(value), ms);
		return () => clearTimeout(timeout);
	}, [value, ms]);

	return debounced;
}
