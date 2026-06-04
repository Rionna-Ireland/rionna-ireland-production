"use client";

import { InstallAppCard } from "./InstallAppCard";
import { MembershipHero } from "./MembershipHero";
import { WhatsInTheAppStrip } from "./WhatsInTheAppStrip";

export function MemberDashboard() {
	return (
		<div className="flex flex-col gap-6 md:gap-8">
			<MembershipHero />
			<WhatsInTheAppStrip />
			<InstallAppCard />
		</div>
	);
}
