"use client";

import { FormControl, FormItem, FormLabel, FormMessage } from "@repo/ui/components/form";
import { useTranslations } from "next-intl";
import type { Ref } from "react";

/**
 * Required, unticked-by-default "I confirm I am 18 or over" checkbox, shown
 * next to the TermsCheckbox at sign-up and on /accept-terms.
 */
export function Over18Checkbox({
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
					{t("legal.over18Checkbox")}
				</FormLabel>
			</div>
			<FormMessage />
		</FormItem>
	);
}
