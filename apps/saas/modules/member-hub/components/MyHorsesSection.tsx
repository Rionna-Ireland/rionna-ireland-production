"use client";

import { toastError } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { HorseFollowCard, type HorseFollowCardHorse } from "./HorseFollowCard";
import {
	applyFollowToggle,
	countFollowing,
	isNextRunForHorse,
	isPendingForHorse,
	shouldHideSection,
} from "./my-horses-section-logic";

interface MyHorsesSectionProps {
	organizationId: string;
}

/**
 * "My horses" dashboard section (S8-03 §4): one card per published horse
 * with a follow toggle, trainer/pedigree, next-run badge, and recent
 * results. Replaces the bare feed-page `MyHorsesFollowPanel` list — the
 * toggle mutations are unchanged (`{ horseId, organizationId }`, optimistic
 * update, invalidate horses.list + circle.getMemberFeed on settle), so the
 * member feed still reacts to follow changes cross-page via the shared
 * TanStack Query cache.
 */
export function MyHorsesSection({ organizationId }: MyHorsesSectionProps) {
	const t = useTranslations();
	const queryClient = useQueryClient();

	const listQueryOptions = orpc.horses.list.queryOptions({ input: { organizationId } });
	const { data: horses, isLoading } = useQuery({
		...listQueryOptions,
		enabled: !!organizationId,
	});

	const { data: nextRun } = useQuery({
		...orpc.horses.nextRun.queryOptions({ input: { organizationId } }),
		enabled: !!organizationId,
	});

	const feedQueryKey = orpc.circle.getMemberFeed.key();

	// One rollback triangle (optimistic flip → revert + toast on error →
	// invalidate on settle) shared by both directions; kept as two separate
	// `useMutation` calls (rather than one branchy builder) so each keeps its
	// own precise `orpc.horses.follow` / `.unfollow` output type.
	async function onMutate(horseId: string, isFollowing: boolean) {
		await queryClient.cancelQueries({ queryKey: listQueryOptions.queryKey });
		const previous = queryClient.getQueryData(listQueryOptions.queryKey);
		queryClient.setQueryData(listQueryOptions.queryKey, (prev) =>
			prev ? applyFollowToggle(prev, horseId, isFollowing) : prev,
		);
		return { previous };
	}

	function onError(context?: { previous?: typeof horses }) {
		if (context?.previous) {
			queryClient.setQueryData(listQueryOptions.queryKey, context.previous);
		}
		toastError(t("app.dashboard.myHorses.followError"));
	}

	function onSettled() {
		void queryClient.invalidateQueries({ queryKey: listQueryOptions.queryKey });
		void queryClient.invalidateQueries({ queryKey: feedQueryKey });
	}

	const followMutation = useMutation(
		orpc.horses.follow.mutationOptions({
			onMutate: ({ horseId }) => onMutate(horseId, true),
			onError: (_error, _vars, context) => onError(context),
			onSettled,
		}),
	);
	const unfollowMutation = useMutation(
		orpc.horses.unfollow.mutationOptions({
			onMutate: ({ horseId }) => onMutate(horseId, false),
			onError: (_error, _vars, context) => onError(context),
			onSettled,
		}),
	);

	if (shouldHideSection(isLoading, horses)) {
		return null;
	}

	const followingCount = countFollowing(horses ?? []);

	return (
		<section className="@container">
			<h2 className="font-display text-2xl text-foreground">{t("app.dashboard.myHorses.title")}</h2>

			{!isLoading && followingCount === 0 ? (
				<p className="mt-1 text-sm text-muted-foreground">
					{t("app.dashboard.myHorses.emptyHint")}
				</p>
			) : null}

			<div className="mt-4 grid grid-cols-1 gap-4 @2xl:grid-cols-2 @4xl:grid-cols-3">
				{(horses ?? []).map((horse) => (
					<HorseFollowCard
						key={horse.id}
						horse={horse as HorseFollowCardHorse}
						nextRun={nextRun ?? undefined}
						isNextRun={isNextRunForHorse(nextRun, horse.id)}
						toggleDisabled={
							isPendingForHorse(followMutation, horse.id) ||
							isPendingForHorse(unfollowMutation, horse.id)
						}
						onToggle={(checked) => {
							if (checked) {
								followMutation.mutate({ horseId: horse.id, organizationId });
							} else {
								unfollowMutation.mutate({ horseId: horse.id, organizationId });
							}
						}}
					/>
				))}
			</div>
		</section>
	);
}
