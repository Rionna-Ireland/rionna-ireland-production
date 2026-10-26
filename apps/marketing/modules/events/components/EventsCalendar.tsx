"use client";

import { cn } from "@repo/ui";
import { JoinCtaLink } from "@shared/components/JoinCtaLink";
import { useInView } from "@shared/components/motion/useInView";
import { PatternMosaic } from "@shared/components/pattern/PatternMosaic";
import { v2Button } from "@shared/components/ui/v2";
import type { JoinCta } from "@shared/lib/join-url";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

import { CLUB_TZ, cellDealDelay, dayKey, monthCells } from "../lib/calendar";

export type CalendarEvent = {
	id: string;
	name: string;
	startsAt: string | null;
	coverImageUrl: string | null;
};

export type CalendarLabels = {
	prev: string;
	next: string;
	close: string;
	membersOnly: string;
	joinLabel: string;
	weekdays: string[];
	hasEvents: string;
};

const CHIP_TONES = ["bg-lilac-light text-plum", "bg-sage text-forest", "bg-ice text-ink"];

/** Reads a motion token (e.g. --dur-reveal) so the Web Animations match the CSS. */
function token(name: string, fallback: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const motionOk = () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function EventsCalendar({
	events,
	locale,
	initial,
	todayKey,
	cta,
	labels,
}: {
	events: CalendarEvent[];
	locale: string;
	initial: { year: number; month: number };
	todayKey: string;
	cta: JoinCta;
	labels: CalendarLabels;
}) {
	const [ym, setYm] = useState(initial);
	const [dir, setDir] = useState<"next" | "prev" | null>(null);
	const [open, setOpen] = useState<{
		key: string;
		inset: [number, number, number, number];
	} | null>(null);
	const wrapRef = useRef<HTMLDivElement>(null);
	const cardRef = useRef<HTMLDivElement>(null);
	const returnRef = useRef<HTMLElement | null>(null);
	const seenRef = useRef<HTMLDivElement>(null);
	const seen = useInView(seenRef, { threshold: 0.1 });

	const byDay = useMemo(() => {
		const map = new Map<string, { event: CalendarEvent; tone: string }[]>();
		events.forEach((event, i) => {
			if (!event.startsAt) return;
			const key = dayKey(event.startsAt);
			const list = map.get(key) ?? [];
			list.push({ event, tone: CHIP_TONES[i % CHIP_TONES.length] ?? "" });
			map.set(key, list);
		});
		return map;
	}, [events]);

	const cells = monthCells(ym.year, ym.month);
	const monthLabel = new Intl.DateTimeFormat(locale, {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(Date.UTC(ym.year, ym.month, 1)));
	const fmtTime = (iso: string) =>
		new Intl.DateTimeFormat(locale, {
			weekday: "long",
			day: "numeric",
			month: "long",
			hour: "numeric",
			minute: "2-digit",
			timeZone: CLUB_TZ,
		}).format(new Date(iso));

	function go(delta: 1 | -1) {
		setDir(delta === 1 ? "next" : "prev");
		setYm(({ year, month }) => {
			const d = new Date(Date.UTC(year, month + delta, 1));
			return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
		});
	}

	function openDay(key: string, el: HTMLElement) {
		const w = wrapRef.current?.getBoundingClientRect();
		if (!w) return;
		const c = el.getBoundingClientRect();
		returnRef.current = el;
		setOpen({
			key,
			inset: [c.top - w.top, w.right - c.right, w.bottom - c.bottom, c.left - w.left],
		});
	}

	const cellClip = (inset: [number, number, number, number]) =>
		`inset(${inset.map((n) => `${Math.round(n)}px`).join(" ")} round 12px)`;

	// Grow the card from the chosen cell and move focus into it.
	useEffect(() => {
		const card = cardRef.current;
		if (!open || !card) return;
		card.focus();
		if (!motionOk()) return;
		card.animate([{ clipPath: cellClip(open.inset) }, { clipPath: "inset(0px round 12px)" }], {
			duration: Number.parseFloat(token("--dur-reveal", "700ms")),
			easing: token("--ease-out-editorial", "ease-out"),
		});
	}, [open]);

	// Return focus once the grid is no longer inert.
	useEffect(() => {
		if (!open) returnRef.current?.focus();
	}, [open]);

	function close() {
		const card = cardRef.current;
		const finish = () => setOpen(null);
		if (!card || !open || !motionOk()) return finish();
		card.animate([{ clipPath: "inset(0px round 12px)" }, { clipPath: cellClip(open.inset) }], {
			duration: Number.parseFloat(token("--dur-hover", "300ms")),
			easing: token("--ease-out-editorial", "ease-out"),
			fill: "forwards",
		}).finished.then(finish, finish);
	}

	const openEvents = open ? (byDay.get(open.key) ?? []) : [];

	return (
		<div ref={seenRef}>
			<div className="mb-8 gap-4 flex items-end justify-between">
				<h2 key={monthLabel} className="type-display-lg capitalize">
					{monthLabel}
				</h2>
				<div className="gap-2 flex">
					{(["prev", "next"] as const).map((which) => (
						<button
							key={which}
							type="button"
							aria-label={labels[which]}
							onClick={() => go(which === "next" ? 1 : -1)}
							className={cn(
								v2Button({ variant: "secondary", size: "md" }),
								"w-10 px-0 text-base",
							)}
						>
							{which === "next" ? "→" : "←"}
						</button>
					))}
				</div>
			</div>

			<div ref={wrapRef} className="relative min-h-[22rem]">
				<div inert={open ? true : undefined}>
					<div className="mb-2 gap-1.5 md:gap-2 grid grid-cols-7" aria-hidden="true">
						{labels.weekdays.map((d) => (
							<span key={d} className="type-label text-ink-variant text-center">
								{d}
							</span>
						))}
					</div>
					<div
						key={`${ym.year}-${ym.month}`}
						role="group"
						aria-label={monthLabel}
						className={cn(
							"gap-1.5 md:gap-2 grid grid-cols-7",
							dir && `cal-slide-${dir}`,
						)}
					>
						{cells.map((cell, i) => {
							const slotKey = cell?.key ?? `blank-${i}`;
							const items = cell ? (byDay.get(cell.key) ?? []) : [];
							// The deal plays on first mount only; month changes slide instead.
							const face = cn(
								"aspect-square rounded-lg",
								!dir && "pc-face",
								!seen && "pc-wait",
							);
							const faceStyle = {
								"--delay": `${cellDealDelay(i)}ms`,
							} as CSSProperties;
							if (!cell) {
								return (
									<div
										key={slotKey}
										className={cn(
											face,
											"border-outline/60 border border-dashed",
										)}
										style={faceStyle}
									/>
								);
							}
							const isToday = cell.key === todayKey;
							const body = (
								<>
									<span
										className={cn(
											"type-display-md text-ink tabular-nums",
											isToday &&
												"decoration-plum underline underline-offset-4",
										)}
									>
										{cell.day}
									</span>
									<span className="gap-0.5 mt-auto flex flex-col">
										{items.slice(0, 2).map(({ event, tone }) => (
											<span
												key={event.id}
												className={cn(
													"px-1.5 py-0.5 rounded leading-tight font-medium md:block hidden truncate text-left text-[11px]",
													tone,
												)}
											>
												{event.name}
											</span>
										))}
										{items.length > 0 && (
											<span
												className="size-1.5 bg-plum md:hidden rounded-full"
												aria-hidden="true"
											/>
										)}
									</span>
								</>
							);
							const base = "p-1.5 md:p-2.5 flex flex-col items-start text-left";
							return items.length > 0 ? (
								<button
									key={slotKey}
									type="button"
									aria-haspopup="dialog"
									aria-label={`${cell.day}, ${labels.hasEvents}`}
									onClick={(e) => openDay(cell.key, e.currentTarget)}
									className={cn(
										face,
										base,
										"bg-white border-outline press hover:border-plum border focus-visible:outline-2 focus-visible:outline-ring",
									)}
									style={faceStyle}
								>
									{body}
								</button>
							) : (
								<div
									key={slotKey}
									className={cn(
										face,
										base,
										"bg-paper/60 border-outline/60 border",
									)}
									style={faceStyle}
								>
									{body}
								</div>
							);
						})}
					</div>
				</div>

				{open && (
					<div
						ref={cardRef}
						role="dialog"
						aria-modal="true"
						aria-label={monthLabel}
						tabIndex={-1}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								e.stopPropagation();
								close();
							}
						}}
						className="inset-0 bg-ink p-5 text-white md:p-8 absolute z-10 overflow-auto rounded-xl outline-none"
					>
						<div
							aria-hidden="true"
							className="inset-0 pointer-events-none absolute overflow-hidden"
						>
							<PatternMosaic
								colourway="navy"
								kind="gem"
								columns={5}
								rows={3}
								className="-right-6 -top-6 w-40 md:w-64 absolute opacity-70"
							/>
						</div>
						<button
							type="button"
							onClick={close}
							className={cn(
								v2Button({ variant: "ghostOnDark", size: "md" }),
								"right-4 top-4 absolute z-10",
							)}
						>
							{labels.close}
						</button>
						<div className="gap-8 relative flex flex-col">
							{openEvents.map(({ event }) => (
								<div key={event.id} className="max-w-2xl gap-3 flex flex-col">
									<span className="type-label text-ice">
										{event.startsAt ? fmtTime(event.startsAt) : ""}
									</span>
									<h3 className="type-display-lg text-balance">{event.name}</h3>
									<p className="text-lilac">{labels.membersOnly}</p>
									<JoinCtaLink
										cta={cta}
										className={cn(
											v2Button({ variant: "onDark" }),
											"self-start",
										)}
									>
										{labels.joinLabel}
									</JoinCtaLink>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
