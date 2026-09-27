import { AcceptTermsForm } from "@auth/components/AcceptTermsForm";
import { getSession } from "@auth/lib/server";
import { safeRedirectPath } from "@auth/lib/terms-gate";
import { getTermsStatus } from "@repo/api/modules/legal/lib/terms";
import { AuthWrapper } from "@shared/components/AuthWrapper";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
	const t = await getTranslations("legal.acceptTerms");

	return {
		title: t("title"),
	};
}

/**
 * S12-10 A3: T&C acceptance prompt. Lives outside the (main) group so the gate
 * in (main)/layout.tsx never redirects here in a loop.
 */
export default async function AcceptTermsPage({
	searchParams,
}: {
	searchParams: Promise<{ redirectTo?: string | string[] }>;
}) {
	const session = await getSession();

	if (!session) {
		redirect("/login");
	}

	const { redirectTo } = await searchParams;
	const destination = safeRedirectPath(Array.isArray(redirectTo) ? redirectTo[0] : redirectTo);

	const { needsAcceptance } = await getTermsStatus({
		userId: session.user.id,
		activeOrganizationId: session.session.activeOrganizationId,
	});

	if (!needsAcceptance) {
		redirect(destination);
	}

	return (
		<AuthWrapper>
			<AcceptTermsForm redirectTo={destination} />
		</AuthWrapper>
	);
}
