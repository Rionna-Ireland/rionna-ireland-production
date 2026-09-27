import { config } from "@config";
import { WaitlistSection } from "@waitlist/components/WaitlistSection";
import { getTranslations } from "next-intl/server";

/**
 * S12-09 (Tom, 2026-09-27): while wireframe mode is on, the minimalist
 * waitlist IS the home page. Press traffic lands here, so the old dashed
 * placeholders are gone. The footer legal links come from the layout; the
 * "Sign in" link stays for existing test accounts.
 */
export async function WireframeHome() {
	const t = await getTranslations("waitlist");

	return (
		<WaitlistSection headingLevel="h1" className="min-h-[80svh]">
			{config.saasUrl && (
				<p className="mt-12 text-xs font-mono tracking-[0.18em] text-muted-foreground uppercase">
					{t("signInPrompt")}{" "}
					<a
						href={config.saasUrl}
						className="text-primary underline underline-offset-4 hover:text-foreground"
					>
						{t("signIn")}
					</a>
				</p>
			)}
		</WaitlistSection>
	);
}
