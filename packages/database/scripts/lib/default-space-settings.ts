/**
 * Pure default-`autoJoin` rule for `seed-space-settings.ts` (S12-02b Task 6).
 *
 * Extracted into its own module (no `db`/`fetch` imports) so it can be
 * unit-tested without the seed script's Circle Admin v2 + Prisma
 * dependencies. See `packages/api/modules/community/__tests__/default-space-settings.test.ts`
 * for the tests (imported by relative path — `packages/database` must not
 * depend on `@repo/api`, so the test lives on the importing side instead).
 *
 * Rule: `autoJoin = !isHorse && !isPrivate && spaceType is a post type &&
 * id !== eventsSpaceId`. "Horse" spaces are follow-driven (S8-03/S8-04) and
 * must never be auto-joined; a space is a horse space when its id matches
 * one of the org's `Horse.circleSpaceId` values OR its `spaceGroupId`
 * equals `circle.spaceGroupId` — a QA finding (S12-02a) showed the group id
 * alone can mismatch a horse's own space, so both checks are kept.
 */

/** Space types that carry readable member posts — mirrors `POST_SPACE_TYPES` in `@repo/api`. */
const DEFAULT_POST_SPACE_TYPES = new Set(["basic", "image"]);

export interface DefaultSpaceSettingsSpace {
	id: string;
	isPrivate: boolean;
	spaceType: string | null;
	spaceGroupId?: string | null;
}

export interface DefaultSpaceSettingsContext {
	/** Circle space ids known to be horse discussion spaces (`Horse.circleSpaceId`). */
	horseSpaceIds: ReadonlySet<string>;
	/** `OrganizationMetadata.circle.spaceGroupId` — the horse-spaces group. */
	spaceGroupId?: string | null;
	/** `OrganizationMetadata.circle.eventsSpaceId` — never auto-joined. */
	eventsSpaceId?: string | null;
	/** Override for testing; defaults to `{"basic", "image"}`. */
	postSpaceTypes?: ReadonlySet<string>;
}

export interface DefaultSpaceSettings {
	autoJoin: boolean;
}

export function defaultSpaceSettings(
	space: DefaultSpaceSettingsSpace,
	ctx: DefaultSpaceSettingsContext,
): DefaultSpaceSettings {
	const postSpaceTypes = ctx.postSpaceTypes ?? DEFAULT_POST_SPACE_TYPES;

	const isHorse =
		ctx.horseSpaceIds.has(space.id) ||
		(space.spaceGroupId != null && ctx.spaceGroupId != null && space.spaceGroupId === ctx.spaceGroupId);

	const isPostType = space.spaceType !== null && postSpaceTypes.has(space.spaceType);
	const isEventsSpace = ctx.eventsSpaceId != null && space.id === ctx.eventsSpaceId;

	return {
		autoJoin: !isHorse && !space.isPrivate && isPostType && !isEventsSpace,
	};
}
