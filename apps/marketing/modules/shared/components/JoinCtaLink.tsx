import { LocaleLink } from "@i18n/routing";
import type { JoinCta } from "@shared/lib/join-url";
import type { AnchorHTMLAttributes } from "react";

/**
 * Renders a `getJoinCta()` target: a plain <a> for the external SaaS signup,
 * a LocaleLink for the waitlist. Forwards props so it works under
 * `<Button asChild>`.
 */
export function JoinCtaLink({
	cta,
	children,
	...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { cta: JoinCta }) {
	if (cta.external) {
		return (
			<a href={cta.href} {...props}>
				{children}
			</a>
		);
	}
	return (
		<LocaleLink href={cta.href} {...props}>
			{children}
		</LocaleLink>
	);
}
