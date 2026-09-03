import { useEffect, useRef } from "react";

export function shouldHydrateOnce(
	hydratedForId: string | null,
	recordId: string,
	isDirty: boolean,
): boolean {
	return hydratedForId !== recordId && !isDirty;
}

/** Hydrates a form once per record, without overwriting unsaved edits. */
export function useHydrateOnce(
	recordId: string | null | undefined,
	isDirty: boolean,
	hydrate: () => void,
): void {
	const hydratedForId = useRef<string | null>(null);

	useEffect(() => {
		if (!recordId || !shouldHydrateOnce(hydratedForId.current, recordId, isDirty)) return;
		hydratedForId.current = recordId;
		hydrate();
	}, [hydrate, isDirty, recordId]);
}
