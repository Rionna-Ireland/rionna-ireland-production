import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

interface SwitchSpyProps {
	checked: boolean;
	disabled?: boolean;
	onCheckedChange: (checked: boolean) => void;
}

const switchPropsByLabel = new Map<string, SwitchSpyProps>();
const followMutate = vi.fn();
const unfollowMutate = vi.fn();
const invalidateQueries = vi.fn();

const mockHorses = [
	{
		id: "h1",
		name: "Shadowfax",
		isFollowing: true,
		trainer: { id: "t1", name: "Gandalf" },
		pedigree: { sire: "Galileo" },
		entries: [
			{
				finishingPosition: 1,
				jockey: { name: "R. Moore" },
				race: {
					name: "Gold Cup",
					distanceFurlongs: 22,
					goingDescription: "Good to Soft",
					meeting: { course: { name: "Ascot" } },
				},
			},
		],
	},
	{
		id: "h2",
		name: "Bucephalus",
		isFollowing: false,
		trainer: null,
		pedigree: null,
		entries: [],
	},
];

vi.mock("@repo/ui/components/switch", () => ({
	Switch: (props: SwitchSpyProps & { "aria-label": string }) => {
		switchPropsByLabel.set(props["aria-label"], props);
		return null;
	},
}));

vi.mock("@repo/ui/components/toast", () => ({
	toastError: vi.fn(),
}));

vi.mock("next-intl", () => ({
	useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
		vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

vi.mock("next/image", () => ({
	default: () => null,
}));

vi.mock("@tanstack/react-query", () => ({
	useQuery: (options: { queryKey: unknown[] }) => {
		if (options.queryKey?.[1] === "nextRun") {
			return { data: undefined, isLoading: false };
		}
		return { data: mockHorses, isLoading: false };
	},
	useQueryClient: () => ({
		cancelQueries: vi.fn(),
		getQueryData: vi.fn(),
		setQueryData: vi.fn(),
		invalidateQueries: invalidateQueries,
	}),
	useMutation: (options: { mutationFn?: unknown }) => {
		// Distinguish the follow vs unfollow mutation by identity of the options
		// object passed in — the component builds one per direction.
		const isFollow = options === followOptionsRef.current;
		return {
			mutate: isFollow ? followMutate : unfollowMutate,
			isPending: false,
			variables: undefined,
		};
	},
}));

// Populated by the orpc mock below so the useMutation mock can tell the two
// mutation option objects apart.
const followOptionsRef: { current: unknown } = { current: undefined };

vi.mock("@shared/lib/orpc-query-utils", () => ({
	orpc: {
		horses: {
			list: {
				queryOptions: (input: unknown) => ({ queryKey: ["horses", "list", input] }),
			},
			nextRun: {
				queryOptions: (input: unknown) => ({ queryKey: ["horses", "nextRun", input] }),
			},
			follow: {
				mutationOptions: (opts: unknown) => {
					followOptionsRef.current = opts;
					return opts;
				},
			},
			unfollow: {
				mutationOptions: (opts: unknown) => opts,
			},
		},
		circle: {
			getMemberFeed: {
				key: () => ["circle", "getMemberFeed"],
			},
		},
	},
}));

import { MyHorsesSection } from "../MyHorsesSection";

afterEach(() => {
	switchPropsByLabel.clear();
	followMutate.mockClear();
	unfollowMutate.mockClear();
	invalidateQueries.mockClear();
});

describe("MyHorsesSection", () => {
	it("renders each horse card with name, trainer, and results", () => {
		const html = renderToStaticMarkup(<MyHorsesSection organizationId="org_1" />);

		expect(html).toContain("Shadowfax");
		expect(html).toContain("Bucephalus");
		expect(html).toContain("app.dashboard.myHorses.trainer:{&quot;name&quot;:&quot;Gandalf&quot;}");
		expect(html).toContain("Gold Cup");
		expect(html).toContain("R. Moore · 2m6f · Good to Soft");

		const followedSwitch = switchPropsByLabel.get(
			'app.dashboard.myHorses.toggleLabel:{"name":"Shadowfax"}',
		);
		const unfollowedSwitch = switchPropsByLabel.get(
			'app.dashboard.myHorses.toggleLabel:{"name":"Bucephalus"}',
		);
		expect(followedSwitch?.checked).toBe(true);
		expect(unfollowedSwitch?.checked).toBe(false);
	});

	it("shows the empty-results state for a horse with no runs yet", () => {
		const html = renderToStaticMarkup(<MyHorsesSection organizationId="org_1" />);

		expect(html).toContain("app.dashboard.myHorses.noResults");
	});

	it("toggling a followed horse off calls the unfollow mutation with its id", () => {
		renderToStaticMarkup(<MyHorsesSection organizationId="org_1" />);

		const followedSwitch = switchPropsByLabel.get(
			'app.dashboard.myHorses.toggleLabel:{"name":"Shadowfax"}',
		);
		followedSwitch?.onCheckedChange(false);

		expect(unfollowMutate).toHaveBeenCalledWith({ horseId: "h1", organizationId: "org_1" });
		expect(followMutate).not.toHaveBeenCalled();
	});

	it("toggling an unfollowed horse on calls the follow mutation with its id", () => {
		renderToStaticMarkup(<MyHorsesSection organizationId="org_1" />);

		const unfollowedSwitch = switchPropsByLabel.get(
			'app.dashboard.myHorses.toggleLabel:{"name":"Bucephalus"}',
		);
		unfollowedSwitch?.onCheckedChange(true);

		expect(followMutate).toHaveBeenCalledWith({ horseId: "h2", organizationId: "org_1" });
		expect(unfollowMutate).not.toHaveBeenCalled();
	});
});
