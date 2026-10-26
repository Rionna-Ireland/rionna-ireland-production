"use client";

import { useEffect } from "react";

/**
 * The arrival is pure CSS; this only skips it (input or focus) and marks it
 * `seen` once it ends or the page unmounts, so client-side returns to `/`
 * never replay it.
 */
export function ArrivalSkip() {
	useEffect(() => {
		const root = document.documentElement;
		const overlay = document.querySelector<HTMLElement>("[data-arrival-overlay]");
		const skip = () => {
			if (root.dataset.arrival !== "seen") root.dataset.arrival = "skip";
		};
		const done = (e: AnimationEvent) => {
			if (e.animationName.startsWith("arrival-lift")) root.dataset.arrival = "seen";
		};
		const events = ["pointerdown", "keydown", "wheel", "focusin"] as const;
		for (const e of events) document.addEventListener(e, skip, { once: true, passive: true });
		overlay?.addEventListener("animationend", done);
		return () => {
			for (const e of events) document.removeEventListener(e, skip);
			overlay?.removeEventListener("animationend", done);
			// Strict-mode remounts reattach synchronously; a real unmount leaves the overlay detached.
			setTimeout(() => {
				if (!overlay?.isConnected) root.dataset.arrival = "seen";
			}, 0);
		};
	}, []);
	return null;
}
