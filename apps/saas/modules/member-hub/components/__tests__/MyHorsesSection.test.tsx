import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

interface SwitchSpyProps {
	checked: boolean;
	disabled?: boolean;
	onCheckedChange: (checked: boolean) => void;
}

const switchPropsByLabel = new Map<string, SwitchSpyProps>();

const { followMutate, unfollowMutate, invalidateQueries, toastError, setQueryData } = vi.hoisted(() => ({
	followMutate: vi.fn(),
	unfollowMutate: vi.fn(),
	invalidateQueries: vi.fn(),
	toastError: vi.fn(),
	setQueryData: vi.fn(),
}));

// Overridden per-test to drive the `horses.followsEnabled` query's `data`,
// and what the simulated `mutate()` resolves with. `vi.hoisted` so the
// hoisted `vi.mock` factories below (which run before these would otherwise
// be initialized) can close over live `let` bindings.
const followsEnabledState = vi.hoisted(() => ({ data: { enabled: true } as { enabled: boolean } | undefined }));
const mutationResolutionState = vi.hoisted(() => ({
	value: { ok: true } as { ok: boolean; disabled?: boolean } | Error,
}));

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
	toastError,
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
		if (options.queryKey?.[1] === "followsEnabled") {
			return { data: followsEnabledState.data, isLoading: false };
		}
		return { data: mockHorses, isLoading: false };
	},
	useQueryClient: () => ({
		cancelQueries: vi.fn(),
		getQueryData: vi.fn(() => "previous-snapshot"),
		setQueryData,
		invalidateQueries: invalidateQueries,
	}),
	useMutation: (options: {
		onMutate?: (vars: unknown) => unknown;
		onSuccess?: (data: unknown, vars: unknown, context: unknown) => unknown;
		onError?: (error: unknown, vars: unknown, context: unknown) => unknown;
		onSettled?: () => unknown;
	}) => {
		// Distinguish the follow vs unfollow mutation by identity of the options
		// object passed in — the component builds one per direction.
		const isFollow = options === followOptionsRef.current;
		const spy = isFollow ? followMutate : unfollowMutate;
		return {
			// Simulates the real mutate() lifecycle (onMutate -> resolve/reject ->
			// onSuccess/onError -> onSettled) so tests can drive the resolved
			// payload set on `mutationResolutionState` and assert the component's
			// rollback logic runs, not just that `mutate` was called with args.
			//
			// The component's real `onMutate` is async (it awaits
			// `cancelQueries`), so real react-query awaits it before calling
			// onSuccess/onError with the resolved context. This mock stands in
			// a synchronously-known context (`{ previous: "previous-snapshot" }`,
			// matching the `getQueryData` stub below) rather than awaiting the
			// real `onMutate` promise, so tests don't need to flush microtasks
			// to observe the rollback.
			mutate: (vars: unknown) => {
				spy(vars);
				options.onMutate?.(vars);
				const context = { previous: "previous-snapshot" };
				if (mutationResolutionState.value instanceof Error) {
					options.onError?.(mutationResolutionState.value, vars, context);
				} else {
					options.onSuccess?.(mutationResolutionState.value, vars, context);
				}
				options.onSettled?.();
			},
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
			followsEnabled: {
				queryOptions: (input: unknown) => ({ queryKey: ["horses", "followsEnabled", input] }),
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
	toastError.mockClear();
	setQueryData.mockClear();
	followsEnabledState.data = { enabled: true };
	mutationResolutionState.value = { ok: true };
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

	it("hides every follow switch when the org-level horseFollows kill-switch is off", () => {
		followsEnabledState.data = { enabled: false };

		renderToStaticMarkup(<MyHorsesSection organizationId="org_1" />);

		expect(switchPropsByLabel.size).toBe(0);
	});

	it("rolls back the optimistic flip and toasts when the mutation resolves disabled (S8-04 §5)", () => {
		// The kill-switch flag itself hasn't loaded as false yet (so the switch
		// is still visible), but the mutation resolves `{ ok: false, disabled: true }`
		// — the org went from enabled to disabled between page load and the click.
		mutationResolutionState.value = { ok: false, disabled: true };

		renderToStaticMarkup(<MyHorsesSection organizationId="org_1" />);

		const followedSwitch = switchPropsByLabel.get(
			'app.dashboard.myHorses.toggleLabel:{"name":"Shadowfax"}',
		);
		followedSwitch?.onCheckedChange(false);

		expect(unfollowMutate).toHaveBeenCalledWith({ horseId: "h1", organizationId: "org_1" });
		expect(setQueryData).toHaveBeenCalledWith(
			expect.arrayContaining(["horses", "list", expect.anything()]),
			"previous-snapshot",
		);
		expect(toastError).toHaveBeenCalledWith("app.dashboard.myHorses.followError");
	});

	it("does not roll back or toast when the mutation resolves ok", () => {
		mutationResolutionState.value = { ok: true };

		renderToStaticMarkup(<MyHorsesSection organizationId="org_1" />);

		const followedSwitch = switchPropsByLabel.get(
			'app.dashboard.myHorses.toggleLabel:{"name":"Shadowfax"}',
		);
		followedSwitch?.onCheckedChange(false);

		expect(toastError).not.toHaveBeenCalled();
	});
});
