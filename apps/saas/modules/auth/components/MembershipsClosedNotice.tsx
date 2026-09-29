import { config } from "@config";
import { Button } from "@repo/ui/components/button";
import { ArrowRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * S12-09 / D39: shown instead of plans / the subscribe button while public
 * signup is closed, for users who aren't invited or staff.
 */
export async function MembershipsClosedNotice() {
	const t = await getTranslations("legal.membershipsClosed");

	return (
		<div className="text-center">
			<h1 className="font-bold text-2xl lg:text-3xl">{t("title")}</h1>
			<p className="mt-2 text-muted-foreground">{t("message")}</p>
			<div className="mt-6">
				<Button asChild variant="primary" className="w-full">
					<a href={`${config.marketingUrl ?? ""}/waitlist`}>
						{t("cta")}
						<ArrowRightIcon className="ml-2 size-4" />
					</a>
				</Button>
			</div>
		</div>
	);
}
