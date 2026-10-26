import { LocaleLink } from "@i18n/routing";
import { v2Button } from "@shared/components/ui/v2";
import { getTranslations } from "next-intl/server";

export default async function NotFoundPage() {
	const t = await getTranslations("notFound");

	return (
		<div
			data-nav-tone="light"
			className="under-nav bg-page pb-24 flex flex-col items-center justify-center text-center"
		>
			<span className="type-label text-plum">{t("code")}</span>
			<h1 className="type-display-xl mt-3">{t("title")}</h1>

			<LocaleLink href="/" className={`${v2Button({ variant: "primary" })} mt-8`}>
				{t("goToHomepage")}
			</LocaleLink>
		</div>
	);
}
