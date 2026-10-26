import { cn } from "@repo/ui";
import Image from "next/image";

import type { StoreLink } from "../lib/store-links";

/** Official badges, unmodified. Apple's is 40px tall; Google's PNG carries padding, so 60px tall shows a 40px badge. */
export function AppStoreButtons({
	ios,
	android,
	tone,
	altIos,
	altAndroid,
	comingSoon,
	className,
}: {
	ios: StoreLink;
	android: StoreLink;
	/** "dark" = on a dark ground (white Apple badge). */
	tone: "dark" | "light";
	altIos: string;
	altAndroid: string;
	comingSoon: string;
	className?: string;
}) {
	const chip = "type-label mt-2 text-xs";
	const chipTone = tone === "dark" ? "text-lilac" : "text-ink-variant";
	return (
		<div className={cn("gap-x-5 gap-y-3 flex flex-wrap items-start", className)}>
			<div className="flex flex-col items-start">
				<a href={ios.href} target="_blank" rel="noopener" className="inline-block">
					<Image
						src={`/store-badges/app-store-${tone === "dark" ? "white" : "black"}.svg`}
						alt={altIos}
						width={120}
						height={40}
						unoptimized
						className="h-10 w-auto"
					/>
				</a>
				{ios.temporary && <span className={cn(chip, chipTone)}>{comingSoon}</span>}
			</div>
			<div className="flex flex-col items-start">
				<a
					href={android.href}
					target="_blank"
					rel="noopener"
					className="-my-2.5 -mx-2.5 inline-block"
				>
					<Image
						src="/store-badges/google-play.png"
						alt={altAndroid}
						width={646}
						height={250}
						sizes="157px"
						className="h-[60px] w-auto"
					/>
				</a>
				{android.temporary && <span className={cn(chip, chipTone)}>{comingSoon}</span>}
			</div>
		</div>
	);
}
