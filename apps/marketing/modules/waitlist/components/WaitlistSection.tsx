import { cn } from "@repo/ui";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { WaitlistForm } from "./WaitlistForm";

/**
 * S12-09 §2b minimalist "Digital Estate" waitlist: one centred column on the
 * cream surface, no cards, no dividers. `.theme-estate` (globals.css) remaps
 * the shadcn tokens so the @repo/ui controls restyle themselves.
 */
export async function WaitlistSection({
	id = "waitlist",
	headingLevel = "h2",
	source,
	className,
	children,
}: {
	id?: string;
	headingLevel?: "h1" | "h2";
	source?: string;
	className?: string;
	children?: ReactNode;
}) {
	const t = await getTranslations("waitlist");
	const Heading = headingLevel;
	const headingId = `${id}-heading`;

	return (
		<section
			id={id}
			aria-labelledby={headingId}
			className={cn("theme-estate scroll-mt-24 bg-background text-foreground", className)}
		>
			<div className="max-w-xl px-6 py-20 md:py-28 mx-auto w-full">
				<p className="text-xs font-mono tracking-[0.22em] text-muted-foreground uppercase">
					{t("eyebrow")}
				</p>
				<Heading
					id={headingId}
					className="mt-6 font-medium text-5xl md:text-6xl font-display leading-[1.02] text-balance text-primary"
				>
					{t.rich("headline", {
						// Inline emphasis (#c39cc0): large display text only (§2b contrast rule).
						em: (chunks) => (
							<em className="font-light text-[#c39cc0] italic">{chunks}</em>
						),
					})}
				</Heading>
				<p className="mt-6 text-lg leading-relaxed text-muted-foreground">{t("body")}</p>

				<div className="mt-12">
					<WaitlistForm source={source} />
				</div>

				{children}
			</div>
		</section>
	);
}
