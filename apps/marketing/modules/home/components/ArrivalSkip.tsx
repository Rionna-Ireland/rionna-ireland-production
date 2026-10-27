"use client";

import { useEffect } from "react";

/**
 * The arrival is pure CSS; this only skips it (input or focus) and marks it
 * `seen` when the page unmounts (never on animationend: that would reset the hero delays mid-choreography), so client-side returns to `/`
 * never replay it.
 */
export function ArrivalSkip() {
	useEffect(() => {
		const root = document.documentElement;
		const overlay = document.querySelector<HTMLElement>("[data-arrival-overlay]");
		const skip = () => {
			if (root.dataset.arrival !== "seen") root.dataset.arrival = "skip";
		};
		const events = ["pointerdown", "keydown", "wheel", "focusin"] as const;
		for (const e of events) document.addEventListener(e, skip, { once: true, passive: true });
		return () => {
			for (const e of events) document.removeEventListener(e, skip);
			// Strict-mode remounts reattach synchronously; a real unmount leaves the overlay detached.
			setTimeout(() => {
				if (!overlay?.isConnected) root.dataset.arrival = "seen";
			}, 0);
		};
	}, []);
	return null;
}
