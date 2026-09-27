"use client";

import { config } from "@config";
import { FormControl, FormItem, FormLabel, FormMessage } from "@repo/ui/components/form";
import { useTranslations } from "next-intl";
import type { ReactNode, Ref } from "react";

/**
 * S12-10 A2: required, unticked-by-default T&C checkbox. Links open the
 * marketing site's legal pages in a new tab so the form keeps its state.
 */
export function TermsCheckbox({
	field,
}: {
	field: {
		name: string;
		ref: Ref<HTMLInputElement>;
		value: boolean | undefined;
		onChange: (value: boolean) => void;
		onBlur: () => void;
	};
}) {
	const t = useTranslations();
	const marketingUrl = config.marketingUrl ?? "";

	const link = (href: string) =>
		function LegalLink(chunks: ReactNode) {
			return (
				<a
					href={`${marketingUrl}${href}`}
					target="_blank"
					rel="noopener noreferrer"
					className="font-medium text-primary underline underline-offset-4"
				>
					{chunks}
				</a>
			);
		};

	return (
		<FormItem>
			<div className="gap-3 flex items-start">
				<FormControl>
					<input
						type="checkbox"
						name={field.name}
						ref={field.ref}
						checked={field.value === true}
						onChange={(event) => field.onChange(event.target.checked)}
						onBlur={field.onBlur}
						className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					/>
				</FormControl>
				<FormLabel className="font-normal text-sm leading-relaxed text-muted-foreground">
					{t.rich("legal.termsCheckbox", {
						terms: link("/legal/terms"),
						privacy: link("/legal/privacy-policy"),
					})}
				</FormLabel>
			</div>
			<FormMessage />
		</FormItem>
	);
}
