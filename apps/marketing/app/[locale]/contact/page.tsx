import { ContactForm } from "@home/components/ContactForm";
import { getClubOrganization } from "@shared/lib/club";
import { redirectIfWireframeMode } from "@shared/lib/wireframe-mode";
import { MailIcon, MapPinIcon, PhoneIcon } from "lucide-react";
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

	return (
		<div className="bg-page">
			<div className="py-14 md:py-[56px] container">
				<div className="gap-12 lg:grid-cols-[1fr_1.2fr] grid">
					<div>
						<span className="type-label text-plum">{t("eyebrow")}</span>
						<h1 className="mt-4 type-display-xl">{t("title")}</h1>
						<p className="mt-4 text-lg text-ink-variant">{t("description")}</p>

						<ul className="mt-10 gap-5 grid">
							{contact.contactEmail && (
								<li className="gap-3 flex items-start">
									<MailIcon className="mt-1 size-5 text-plum" />
									<div>
										<span className="type-label text-ink-muted">
											{t("emailLabel")}
										</span>
										<a
											className="mt-0.5 font-medium block"
											href={`mailto:${contact.contactEmail}`}
										>
											{contact.contactEmail}
										</a>
									</div>
								</li>
							)}
							{contact.phone && (
								<li className="gap-3 flex items-start">
									<PhoneIcon className="mt-1 size-5 text-plum" />
									<div>
										<span className="type-label text-ink-muted">
											{t("phoneLabel")}
										</span>
										<a
											className="mt-0.5 font-medium block"
											href={`tel:${contact.phone.replace(/\s+/g, "")}`}
										>
											{contact.phone}
										</a>
									</div>
								</li>
							)}
							{contact.address && (
								<li className="gap-3 flex items-start">
									<MapPinIcon className="mt-1 size-5 text-plum" />
									<div>
										<span className="type-label text-ink-muted">
											{t("addressLabel")}
										</span>
										<p className="mt-0.5 font-medium whitespace-pre-line">
											{contact.address}
										</p>
									</div>
								</li>
							)}
						</ul>
					</div>

					<div>
						<ContactForm />
					</div>
				</div>
			</div>
		</div>
	);
}
