import { ContactForm } from "@home/components/ContactForm";
import { getClubOrganization } from "@shared/lib/club";
import { redirectIfWireframeMode } from "@shared/lib/wireframe-mode";
import { MailIcon, MapPinIcon, PhoneIcon } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "contact" });
	return {
		title: t("title"),
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
		<div className="container py-16 md:py-24">
			<div className="gap-12 lg:grid-cols-[1fr_1.2fr] grid">
				<div>
					<span className="font-mono text-xs tracking-[0.22em] uppercase text-foreground/70">
						{t("eyebrow")}
					</span>
					<h1 className="mt-4 font-display font-medium text-5xl md:text-6xl leading-tight">
						{t("title")}
					</h1>
					<p className="mt-4 text-lg text-foreground/70">{t("description")}</p>

					<ul className="mt-10 gap-5 grid">
						{contact.contactEmail && (
							<li className="flex items-start gap-3">
								<MailIcon className="mt-1 size-5 text-foreground/70" />
								<div>
									<span className="font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/60">
										{t("emailLabel")}
									</span>
									<a
										className="mt-0.5 block font-medium"
										href={`mailto:${contact.contactEmail}`}
									>
										{contact.contactEmail}
									</a>
								</div>
							</li>
						)}
						{contact.phone && (
							<li className="flex items-start gap-3">
								<PhoneIcon className="mt-1 size-5 text-foreground/70" />
								<div>
									<span className="font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/60">
										{t("phoneLabel")}
									</span>
									<a
										className="mt-0.5 block font-medium"
										href={`tel:${contact.phone.replace(/\s+/g, "")}`}
									>
										{contact.phone}
									</a>
								</div>
							</li>
						)}
						{contact.address && (
							<li className="flex items-start gap-3">
								<MapPinIcon className="mt-1 size-5 text-foreground/70" />
								<div>
									<span className="font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/60">
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
	);
}
