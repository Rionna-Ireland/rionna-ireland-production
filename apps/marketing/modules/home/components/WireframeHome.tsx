import { config } from "@config";
import { LocaleLink } from "@i18n/routing";
import { Button } from "@repo/ui/components/button";
import { ArrowRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import NextLink from "next/link";

function PlaceholderBar({ className }: { className?: string }) {
	return (
		<div
			className={`rounded-md border border-dashed border-foreground/20 bg-muted/50 ${className ?? ""}`}
		/>
	);
}

function PlaceholderBlock({ className }: { className?: string }) {
	return (
		<div
			className={`rounded-2xl border border-dashed border-foreground/20 bg-muted/40 ${className ?? ""}`}
		/>
	);
}

export async function WireframeHome() {
	const t = await getTranslations("home.wireframe");

	return (
		<div className="container py-16 md:py-24">
			<div className="mb-4 font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/50">
				{t("badge")}
			</div>

			<section className="max-w-4xl">
				<PlaceholderBar className="h-3 w-24" />
				<PlaceholderBar className="mt-6 h-14 w-full max-w-2xl" />
				<PlaceholderBar className="mt-4 h-14 w-full max-w-xl" />
				<PlaceholderBar className="mt-6 h-4 w-full max-w-lg" />
				<PlaceholderBar className="mt-2 h-4 w-full max-w-md" />

				<div className="mt-10 flex flex-wrap gap-3">
					<Button size="lg" variant="primary" asChild>
						<LocaleLink href="/membership">
							{t("joinCta")}
							<ArrowRightIcon className="ml-2 size-4" />
						</LocaleLink>
					</Button>
					{config.saasUrl && (
						<Button size="lg" variant="outline" asChild>
							<NextLink href={config.saasUrl}>{t("signInCta")}</NextLink>
						</Button>
					)}
				</div>
			</section>

			<section className="mt-20 gap-6 md:grid-cols-3 grid">
				<PlaceholderBlock className="aspect-[4/3]" />
				<PlaceholderBlock className="aspect-[4/3]" />
				<PlaceholderBlock className="aspect-[4/3]" />
			</section>

			<section className="mt-20">
				<PlaceholderBar className="h-8 w-48" />
				<div className="mt-8 gap-4 md:grid-cols-2 grid">
					<PlaceholderBlock className="h-32" />
					<PlaceholderBlock className="h-32" />
					<PlaceholderBlock className="h-32" />
					<PlaceholderBlock className="h-32" />
				</div>
			</section>

			<section className="mt-20">
				<PlaceholderBar className="h-8 w-40" />
				<div className="mt-8 gap-6 md:grid-cols-3 grid">
					<PlaceholderBlock className="h-48" />
					<PlaceholderBlock className="h-48" />
					<PlaceholderBlock className="h-48" />
				</div>
			</section>
		</div>
	);
}
