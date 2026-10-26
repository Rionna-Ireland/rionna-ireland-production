"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@repo/ui/components/accordion";

import type { FaqItem } from "./faq-items";

export function MembershipFaq({ items, title }: { items: FaqItem[]; title?: string }) {
	return (
		<div>
			{title ? <h2 className="type-display-md">{title}</h2> : null}
			<Accordion type="single" collapsible className="mt-8 border-ink/15 border-t">
				{items.map((item, i) => (
					<AccordionItem
						key={`${item.question}-${i}`}
						value={`faq-${i}`}
						className="border-ink/15"
					>
						<AccordionTrigger className="faq-trigger py-6 text-xl md:text-2xl font-normal text-left font-display hover:no-underline [&>svg]:hidden">
							{item.question}
							<span className="faq-plus" aria-hidden="true" />
						</AccordionTrigger>
						<AccordionContent className="max-w-prose text-base text-ink-variant">
							{item.answer}
						</AccordionContent>
					</AccordionItem>
				))}
			</Accordion>
		</div>
	);
}
