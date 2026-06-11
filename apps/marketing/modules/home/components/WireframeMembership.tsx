import { config } from "@config";
import { Button } from "@repo/ui/components/button";
import { ArrowRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

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

export async function WireframeMembership() {
	const t = await getTranslations("membership.wireframe");

	const signupUrl = config.saasUrl
		? `${String(config.saasUrl).replace(/\/$/, "")}/signup`
		: "#";

	return (
		<div className="container py-16 md:py-24">
			<div className="mb-4 font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/50">
				{t("badge")}
			</div>

			<div className="max-w-3xl">
				<PlaceholderBar className="h-3 w-24" />
				<PlaceholderBar className="mt-6 h-12 w-full max-w-lg" />
				<PlaceholderBar className="mt-4 h-4 w-full max-w-md" />
				<PlaceholderBar className="mt-2 h-4 w-full max-w-sm" />
			</div>

			<div className="mt-16 gap-10 lg:grid-cols-[1.2fr_1fr] grid">
				<div className="rounded-3xl border border-dashed border-foreground/20 p-8 md:p-10 bg-muted/30">
					<PlaceholderBar className="h-8 w-40" />
					<div className="mt-6 flex items-baseline gap-3">
						<PlaceholderBar className="h-12 w-28" />
						<PlaceholderBar className="h-3 w-16" />
					</div>
					<PlaceholderBar className="mt-4 h-3 w-48" />

					<div className="mt-8 gap-3 grid">
						{Array.from({ length: 4 }).map((_, index) => (
							<PlaceholderBar key={index} className="h-4 w-full max-w-sm" />
						))}
					</div>

					<div className="mt-10">
						<Button size="lg" variant="primary" asChild className="w-full sm:w-auto">
							<a href={signupUrl}>
								{t("cta")}
								<ArrowRightIcon className="ml-2 size-4" />
							</a>
						</Button>
					</div>
				</div>

				<div>
					<PlaceholderBar className="h-8 w-24" />
					<div className="mt-6 gap-4 grid">
						<PlaceholderBlock className="h-16" />
						<PlaceholderBlock className="h-16" />
						<PlaceholderBlock className="h-16" />
					</div>
				</div>
			</div>
		</div>
	);
}
