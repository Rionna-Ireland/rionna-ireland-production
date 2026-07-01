import { getActiveOrganization } from "@auth/lib/server";
import { formatFeedDate } from "@member-hub/lib/feed-format";
import { getMemberPost } from "@repo/api/modules/circle/procedures/get-member-post";
import { PageHeader } from "@shared/components/PageHeader";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

type Params = { organizationSlug: string; spaceId: string; postId: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
	const { organizationSlug, spaceId, postId } = await params;
	const activeOrganization = await getActiveOrganization(organizationSlug);
	if (!activeOrganization) return { title: "Feed" };
	const post = await getMemberPost.callable({ context: { headers: await headers() } })({
		organizationId: activeOrganization.id,
		spaceId,
		postId,
	});
	return { title: post ? post.title : "Feed" };
}

export default async function MemberPostPage({ params }: { params: Promise<Params> }) {
	const { organizationSlug, spaceId, postId } = await params;
	const activeOrganization = await getActiveOrganization(organizationSlug);
	if (!activeOrganization) return notFound();

	const post = await getMemberPost.callable({ context: { headers: await headers() } })({
		organizationId: activeOrganization.id,
		spaceId,
		postId,
	});
	if (!post) return notFound();

	const meta = [post.spaceName, formatFeedDate(post.createdAt)].filter(Boolean).join(" · ");

	return (
		<div>
			<PageHeader title="Feed" />

			<article className="mx-auto max-w-3xl">
				<Link
					href={`/${organizationSlug}/feed`}
					className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
				>
					&larr; Back to feed
				</Link>

				<header className="mt-8">
					{meta ? (
						<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{meta}</span>
					) : null}
					<h1 className="mt-3 text-balance font-display text-4xl font-medium leading-tight text-foreground md:text-5xl">
						{post.title}
					</h1>
					{post.authorName ? (
						<p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
							By {post.authorName}
						</p>
					) : null}
				</header>

				{post.imageUrl ? (
					<div className="mt-10 overflow-hidden rounded-2xl bg-secondary">
						{/* biome-ignore lint/a11y/useAltText: title used as alt */}
						<img src={post.imageUrl} alt={post.title} className="h-auto w-full object-cover" />
					</div>
				) : null}

				{post.bodyHtml ? (
					<div
						className="prose prose-neutral dark:prose-invert mt-10 max-w-none prose-headings:font-display prose-headings:font-medium"
						// biome-ignore lint/security/noDangerouslySetInnerHtml: Circle-sanitised member content, read-only
						dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
					/>
				) : post.bodyText ? (
					<div className="prose prose-neutral dark:prose-invert mt-10 max-w-none">
						<p className="whitespace-pre-line text-foreground/85">{post.bodyText}</p>
					</div>
				) : (
					<p className="mt-10 text-muted-foreground">This update is best viewed in the app.</p>
				)}
			</article>
		</div>
	);
}
