"use client";

import { InstallAppCard } from "./InstallAppCard";
import { MembershipHero } from "./MembershipHero";
import { MyHorsesSection } from "./MyHorsesSection";
import { WhatsInTheAppStrip } from "./WhatsInTheAppStrip";

interface MemberDashboardProps {
	organizationId: string;
}

export function MemberDashboard({ organizationId }: MemberDashboardProps) {
	return (
		<div className="flex flex-col gap-6 md:gap-8">
			<MembershipHero />
			<MyHorsesSection organizationId={organizationId} />
			<WhatsInTheAppStrip />
			<InstallAppCard />
		</div>
	);
}
