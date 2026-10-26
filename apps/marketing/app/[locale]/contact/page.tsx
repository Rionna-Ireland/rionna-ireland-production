import { ContactForm } from "@home/components/ContactForm";
import { MaskedText } from "@shared/components/motion/MaskedText";
import { Reveal } from "@shared/components/motion/Reveal";
import { getClubOrganization } from "@shared/lib/club";
import { redirectIfWireframeMode } from "@shared/lib/wireframe-mode";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "contact.meta" });
	return {
		title: t("title"),
		description: t("description"),
	};
}

export default async function ContactPage(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	setRequestLocale(locale);
	redirectIfWireframeMode(locale);

	const t = await getTranslations({ locale, namespace: "contact" });
	const club = await getClubOrganization();
	const contact = club.metadata.contact ?? {};

	const details = [
		{
			label: t("emailLabel"),
			value: contact.contactEmail,
			href: `mailto:${contact.contactEmail}`,
		},
		{
			label: t("phoneLabel"),
			value: contact.phone,
			href: `tel:${contact.phone?.replace(/\s+/g, "")}`,
		},
		{ label: t("addressLabel"), value: contact.address },
	].filter((d) => d.value);

	return (
		// The glass nav carries its own tint, so "light" reads over both halves.
		<div data-nav-tone="light" className="lg:grid-cols-2 lg:min-h-svh grid">
			<section className="grain bg-ink px-6 pt-36 pb-16 text-white lg:px-16 lg:pb-24 relative isolate">
				<div className="max-w-xl ml-auto">
					<Reveal immediate>
						<span className="type-label text-lilac">{t("eyebrow")}</span>
					</Reveal>
					<MaskedText
						as="h1"
						immediate
						text={t("hello")}
						className="mt-4 font-medium font-display text-[clamp(3.5rem,9vw,7rem)] leading-[0.95] text-balance"
					/>
					<Reveal immediate delayMs={400}>
						<p className="mt-6 text-lg text-white/70">{t("description")}</p>
					</Reveal>

					<dl className="mt-12 gap-8 grid">
						{details.map((d, i) => (
							<Reveal key={d.label} immediate delayMs={500 + i * 100}>
								<dt className="type-label text-lilac">{d.label}</dt>
								<dd className="mt-1 text-2xl font-display whitespace-pre-line">
									{d.href ? (
										<a className="hover:underline" href={d.href}>
											{d.value}
										</a>
									) : (
										d.value
									)}
								</dd>
							</Reveal>
						))}
					</dl>
				</div>
			</section>

			<section className="bg-page px-6 py-16 lg:px-16 lg:pt-36 lg:pb-24">
				<div className="max-w-xl">
					<ContactForm />
				</div>
			</section>
		</div>
	);
}
