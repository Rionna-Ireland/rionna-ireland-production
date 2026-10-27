import { cn } from "@repo/ui";

// Design V2 button classes (mobile button.tsx). Usable on <a>, LocaleLink or <button>.
const variants = {
	primary: "bg-primary text-primary-foreground hover:bg-label",
	secondary: "border border-primary bg-white text-ink hover:bg-cream",
	accent: "bg-lilac-light text-plum hover:bg-lilac",
	onDark: "bg-white text-ink hover:bg-cream",
	ghostOnDark: "border border-white bg-transparent text-white hover:bg-white/10",
} as const;

const sizes = {
	lg: "h-[45px] rounded-lg px-[26px] text-[15px]",
	md: "h-[30px] rounded-md px-4 text-xs",
} as const;

export function v2Button({
	variant,
	size = "lg",
}: {
	variant: keyof typeof variants;
	size?: keyof typeof sizes;
}): string {
	return cn(
		"press font-semibold inline-flex shrink-0 items-center justify-center whitespace-nowrap hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
		variants[variant],
		sizes[size],
	);
}
