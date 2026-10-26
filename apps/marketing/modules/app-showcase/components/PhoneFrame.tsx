import { cn } from "@repo/ui";
import Image from "next/image";

/** CSS phone: ink bezel, soft highlight. The frames are real iOS simulator captures, 780x1696 (iPhone 17 Pro ratio). */
export function PhoneFrame({
	src,
	alt,
	priority,
	sizes = "(min-width: 1024px) 20rem, 70vw",
	className,
}: {
	src: string;
	alt: string;
	priority?: boolean;
	sizes?: string;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"bg-ink w-full rounded-[48px] p-[9px] shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.14),0_30px_60px_-24px_rgb(23_39_65/0.55)]",
				className,
			)}
		>
			<div className="relative aspect-[780/1696] w-full overflow-hidden rounded-[39px]">
				<Image
					src={src}
					alt={alt}
					fill
					sizes={sizes}
					priority={priority}
					className="object-cover object-top"
				/>
			</div>
		</div>
	);
}
