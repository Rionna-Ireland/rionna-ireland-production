"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@repo/ui/components/accordion";
import { useState } from "react";

import type { FaqItem } from "./faq-items";

/** Two columns on desktop: sticky question index (opens + scrolls to the item) and the accordion. */
export function MembershipFaq({ items, title }: { items: FaqItem[]; title?: string }) {
	const [open, setOpen] = useState("");
	const goTo = (i: number) => {
		setOpen(`faq-${i}`);
		document.getElementById(`faq-item-${i}`)?.scrollIntoView({ block: "center" });
	};
	return (
		<div className="gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20 grid">
			<div className="lg:self-start lg:sticky lg:top-28">
				{title ? <h2 className="type-display-md">{title}</h2> : null}
				<ol className="mt-6 gap-1 lg:grid hidden">
					{items.map((item, i) => (
						<li key={`${item.question}-${i}`}>
							<button
								type="button"
								onClick={() => goTo(i)}
								className="gap-3 py-1 text-sm text-ink-variant hover:text-ink flex w-full text-left transition-colors duration-(--dur-hover)"
							>
								<span className="type-label text-plum">
									{String(i + 1).padStart(2, "0")}
								</span>
								<span>{item.question}</span>
							</button>
						</li>
					))}
				</ol>
			</div>
			<Accordion type="single" collapsible value={open} onValueChange={setOpen}>
				{items.map((item, i) => (
					<AccordionItem
						key={`${item.question}-${i}`}
						id={`faq-item-${i}`}
						value={`faq-${i}`}
						className="scroll-mt-28 border-ink/15"
					>
						<AccordionTrigger className="faq-trigger py-5 text-base font-medium text-left hover:no-underline [&>svg]:hidden">
							{item.question}
							<span className="faq-plus" aria-hidden="true" />
						</AccordionTrigger>
						<AccordionContent className="text-ink-variant">
							{item.answer}
						</AccordionContent>
					</AccordionItem>
				))}
			</Accordion>
		</div>
	);
}
