"use client";

import {
	cn,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@repo/ui";
import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function SettingsMenu({
	menuItems,
	className,
}: {
	menuItems: {
		title: string;
		items: {
			title: string;
			href: string;
			icon?: ReactNode;
		}[];
	}[];
	className?: string;
}) {
	const pathname = usePathname();

	const allItems = menuItems.flatMap((item) => item.items);

	// Active = the most specific matching href (longest prefix wins), so a
	// parent like "/admin" doesn't light up on every "/admin/*" child page.
	const activeHref = allItems
		.map((item) => item.href)
		.filter((href) => pathname === href || pathname.startsWith(`${href}/`))
		.sort((a, b) => b.length - a.length)[0];

	const isActiveMenuItem = (href: string) => href === activeHref;
	const isActiveGroup = (items: (typeof allItems)[number][]) =>
		items.some((item) => item.href === activeHref);

	return (
		<div className={cn("relative border-b", className)}>
			<nav className="gap-1 py-2 flex flex-wrap" aria-label="Admin navigation">
				{menuItems.map((menuItem) => {
					const groupIsActive = isActiveGroup(menuItem.items);

					if (menuItem.items.length === 1) {
						const item = menuItem.items[0];
						return (
							<Link
								key={item.href}
								href={item.href}
								aria-current={isActiveMenuItem(item.href) ? "page" : undefined}
								className={cn(
									"gap-2 px-3 py-2 text-sm flex shrink-0 items-center rounded-md transition-colors",
									isActiveMenuItem(item.href)
										? "font-semibold bg-accent text-foreground"
										: "font-medium text-foreground/60 hover:bg-accent/50",
								)}
							>
								{item.icon}
								{item.title}
							</Link>
						);
					}

					return (
						<DropdownMenu key={menuItem.title}>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className={cn(
										"gap-2 px-3 py-2 text-sm flex shrink-0 items-center rounded-md transition-colors",
										groupIsActive
											? "font-semibold bg-accent text-foreground"
											: "font-medium text-foreground/60 hover:bg-accent/50",
									)}
								>
									{menuItem.title}
									<ChevronDownIcon className="size-3.5 opacity-60" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start">
								<DropdownMenuLabel>{menuItem.title}</DropdownMenuLabel>
								{menuItem.items.map((item) => (
									<DropdownMenuItem key={item.href} asChild>
										<Link
											href={item.href}
											aria-current={isActiveMenuItem(item.href) ? "page" : undefined}
											className={cn(
												"gap-2 flex w-full items-center",
												isActiveMenuItem(item.href) && "font-semibold",
											)}
										>
											{item.icon}
											{item.title}
										</Link>
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					);
				})}
			</nav>
		</div>
	);
}
