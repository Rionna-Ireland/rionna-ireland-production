import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@repo/ui/components/accordion";

export interface FaqItem {
	question: string;
	answer: string;
}

/** Admin items win; the translated fallback is only built when none are set. */
export const pickItems = <T,>(admin: T[], fallback: () => T[]): T[] =>
	admin.length > 0 ? admin : fallback();

export function MembershipFaq({ items }: { items: FaqItem[] }) {
	return (
		<Accordion type="single" collapsible className="mt-6">
			{items.map((item, i) => (
				<AccordionItem key={`${item.question}-${i}`} value={`faq-${i}`}>
					<AccordionTrigger className="font-medium text-left">
						{item.question}
					</AccordionTrigger>
					<AccordionContent className="text-ink-variant">{item.answer}</AccordionContent>
				</AccordionItem>
			))}
		</Accordion>
	);
}
