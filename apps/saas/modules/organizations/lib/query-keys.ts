export const organizationListQueryKey = ["user", "organizations"] as const;

export interface ActiveOrganizationIdentifier {
	slug?: string;
	id?: string;
}

export const activeOrganizationQueryKey = (identifier: ActiveOrganizationIdentifier) =>
	["user", "activeOrganization", identifier.slug ?? identifier.id ?? ""] as const;

export const fullOrganizationQueryKey = (id: string) => ["fullOrganization", id] as const;
