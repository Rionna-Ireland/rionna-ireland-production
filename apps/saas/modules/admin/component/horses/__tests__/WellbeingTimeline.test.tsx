// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// Regression coverage for the "quiet publish" bug: the Publish action used to
// hard-code notifyMembers=true, making the backend's quiet-publish path (and
// the publishedNoNotify toast) unreachable from the UI. There must be a
// distinct affordance that calls handlePublish(id, false).

const publishMutate = vi.fn().mockResolvedValue(undefined);
const createMutate = vi.fn().mockResolvedValue(undefined);
const deleteMutate = vi.fn().mockResolvedValue(undefined);
const invalidateQueries = vi.fn();

const draftUpdate = {
	id: "w-1",
	type: "VET",
	body: "Routine checkup.",
	publishedAt: null,
};

vi.mock("@repo/ui/components/toast", () => ({
	toastError: vi.fn(),
	toastSuccess: vi.fn(),
}));

vi.mock("next-intl", () => ({
	useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
		vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({ data: [draftUpdate], isLoading: false }),
	useQueryClient: () => ({ invalidateQueries }),
	useMutation: (options: { mutationFn?: unknown }) => {
		if (options === publishOptionsRef.current) {
			return { mutateAsync: publishMutate, isPending: false };
		}
		if (options === createOptionsRef.current) {
			return { mutateAsync: createMutate, isPending: false };
		}
		return { mutateAsync: deleteMutate, isPending: false };
	},
}));

const publishOptionsRef: { current: unknown } = { current: undefined };
const createOptionsRef: { current: unknown } = { current: undefined };

vi.mock("@shared/lib/orpc-query-utils", () => ({
	orpc: {
		admin: {
			horses: {
				wellbeing: {
					list: {
						queryOptions: (input: unknown) => ({ queryKey: ["wellbeing", "list", input] }),
						key: () => ["wellbeing", "list"],
					},
					create: {
						mutationOptions: (opts: unknown) => {
							createOptionsRef.current = opts;
							return opts;
						},
					},
					publish: {
						mutationOptions: (opts: unknown) => {
							publishOptionsRef.current = opts;
							return opts;
						},
					},
					delete: {
						mutationOptions: (opts: unknown) => opts,
					},
				},
			},
		},
	},
}));

import { WellbeingTimeline } from "../WellbeingTimeline";

describe("WellbeingTimeline publish actions", () => {
	let root: Root | null = null;
	let container: HTMLElement | null = null;

	afterEach(() => {
		act(() => root?.unmount());
		container?.remove();
		root = null;
		container = null;
		publishMutate.mockClear();
		createMutate.mockClear();
		deleteMutate.mockClear();
		invalidateQueries.mockClear();
	});

	function renderComponent() {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		act(() => {
			root?.render(<WellbeingTimeline horseId="h-1" />);
		});
	}

	function clickButtonByText(text: string) {
		const button = Array.from(container?.querySelectorAll("button") ?? []).find(
			(el) => el.textContent === text,
		);
		if (!button) {
			throw new Error(`Button with text "${text}" not found`);
		}
		act(() => {
			button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
	}

	it("offers a quiet-publish action distinct from publish & notify", () => {
		renderComponent();

		expect(
			Array.from(container?.querySelectorAll("button") ?? []).some(
				(el) => el.textContent === "admin.horses.wellbeing.publishQuiet",
			),
		).toBe(true);
	});

	it("publish & notify calls the mutation with notifyMembers=true", () => {
		renderComponent();

		clickButtonByText("admin.horses.wellbeing.publish");

		expect(publishMutate).toHaveBeenCalledWith({ updateId: "w-1", notifyMembers: true });
	});

	it("publish quietly calls the mutation with notifyMembers=false", () => {
		renderComponent();

		clickButtonByText("admin.horses.wellbeing.publishQuiet");

		expect(publishMutate).toHaveBeenCalledWith({ updateId: "w-1", notifyMembers: false });
	});
});
