import { OfferForm } from "@admin/component/offers/OfferForm";

export default async function AdminOfferEditPage({
	params,
}: {
	params: Promise<{ offerId: string }>;
}) {
	const { offerId } = await params;
	return <OfferForm offerId={offerId} />;
}
