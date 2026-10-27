import { NotFoundPanel } from "@shared/components/NotFoundPanel";
import { getTranslations } from "next-intl/server";

export default async function NotFoundPage() {
	const t = await getTranslations("notFound");

	return <NotFoundPanel code={t("code")} title={t("title")} home={t("goToHomepage")} />;
}
