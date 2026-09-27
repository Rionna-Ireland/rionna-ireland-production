import { MembersRoster } from "@admin/component/members/MembersRoster";

export default async function AdminMembersPage({
	searchParams,
}: {
	searchParams: Promise<{ export?: string }>;
}) {
	const params = await searchParams;
	return <MembersRoster openHriExport={params.export === "hri"} />;
}
