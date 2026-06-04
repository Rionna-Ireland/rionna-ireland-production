interface ListPurchasesInput {
	organizationId?: string;
}

export const listPurchasesQueryKey = (input: ListPurchasesInput = {}) =>
	[["payments", "listPurchases"], { input, type: "query" }] as const;

export const getSubscriptionSummaryQueryKey = () =>
	[["payments", "getSubscriptionSummary"], { type: "query" }] as const;
