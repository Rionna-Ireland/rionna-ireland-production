import { v2Button } from "@shared/components/ui/v2";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

export async function generateMetadata(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "preview" });
	return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function PreviewPage(props: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<{ error?: string }>;
}) {
	const { locale } = await props.params;
	setRequestLocale(locale);
	if (!process.env.MARKETING_PREVIEW_PASSWORD) notFound();

	const [{ error }, t] = await Promise.all([props.searchParams, getTranslations("preview")]);

	return (
		<section className="bg-ink text-white px-4 grid min-h-svh place-items-center">
			<form
				method="post"
				action="/api/preview"
				className="gap-5 max-w-sm flex w-full flex-col"
			>
				<h1 className="text-4xl font-display">{t("title")}</h1>
				<label htmlFor="preview-password" className="type-label text-lilac">
					{t("password")}
				</label>
				<input
					id="preview-password"
					name="password"
					type="password"
					required
					autoComplete="current-password"
					aria-invalid={error ? true : undefined}
					aria-describedby={error ? "preview-error" : undefined}
					className="h-12 px-4 text-white border-white/40 focus-visible:outline-white rounded-lg border bg-transparent focus-visible:outline-2"
				/>
				{error && (
					<p id="preview-error" role="alert" className="text-sm text-white/80">
						{t("error")}
					</p>
				)}
				<button type="submit" className={v2Button({ variant: "onDark" })}>
					{t("submit")}
				</button>
			</form>
		</section>
	);
}
