"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { POST_AS_CLUB, PostAsPicker } from "../updates/PostAsPicker";

/**
 * S13-19: answer a thread as a trainer (comment sidecar) and see / clear the
 * thread's pinned expert answer. Keyed by Circle post id.
 */
export function ThreadsTab() {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const { organizationId: orgId } = useAdminOrganization();
	const organizationId = orgId ?? "";
	const [draftId, setDraftId] = useState("");
	const [postId, setPostId] = useState("");
	const [postAs, setPostAs] = useState(POST_AS_CLUB);
	const [body, setBody] = useState("");

	const pinned = useQuery({
		...orpc.admin.community.pinnedAnswer.get.queryOptions({
			input: { organizationId, circlePostId: postId },
		}),
		enabled: !!organizationId && postId.length > 0,
	});
	const clear = useMutation(orpc.admin.community.pinnedAnswer.clear.mutationOptions());
	const reply = useMutation(orpc.admin.community.replyAsTrainer.mutationOptions());

	function onUnpin() {
		clear.mutate(
			{ organizationId, circlePostId: postId },
			{
				onSuccess: () => {
					toastSuccess(t("admin.moderation.threads.unpinned"));
					void queryClient.invalidateQueries({
						queryKey: orpc.admin.community.pinnedAnswer.get.key(),
					});
				},
				onError: () => toastError(t("admin.moderation.threads.error")),
			},
		);
	}

	function onReply() {
		reply.mutate(
			{
				organizationId,
				circlePostId: postId,
				body,
				trainerId: postAs === POST_AS_CLUB ? null : postAs,
			},
			{
				onSuccess: () => {
					toastSuccess(t("admin.moderation.threads.sent"));
					setBody("");
				},
				onError: () => toastError(t("admin.moderation.threads.error")),
			},
		);
	}

	const pin = pinned.data?.pinned ?? null;

	return (
		<div className="gap-6 flex flex-col">
			<p className="text-sm text-muted-foreground">{t("admin.moderation.threads.intro")}</p>
			<div className="gap-2 flex items-end">
				<div className="gap-2 grid">
					<Label htmlFor="thread-post-id">{t("admin.moderation.threads.postId")}</Label>
					<Input
						id="thread-post-id"
						className="w-64"
						value={draftId}
						onChange={(event) => setDraftId(event.target.value.trim())}
					/>
				</div>
				<Button variant="outline" disabled={!draftId} onClick={() => setPostId(draftId)}>
					{t("admin.moderation.threads.load")}
				</Button>
			</div>

			{postId && (
				<>
					<div className="gap-2 flex flex-col">
						<h3 className="text-sm font-medium">
							{t("admin.moderation.threads.pinnedTitle")}
						</h3>
						{pin ? (
							<div className="gap-4 flex items-center">
								<p className="text-sm text-muted-foreground">
									{t("admin.moderation.threads.pinnedMeta", {
										commentId: pin.circleCommentId,
										name: pin.pinnedByName ?? "-",
										date: new Date(pin.pinnedAt).toLocaleDateString(),
									})}
								</p>
								<Button
									variant="outline"
									size="sm"
									onClick={onUnpin}
									disabled={clear.isPending}
								>
									{t("admin.moderation.threads.unpin")}
								</Button>
							</div>
						) : (
							<p className="text-sm text-muted-foreground">
								{t("admin.moderation.threads.noPin")}
							</p>
						)}
					</div>

					<div className="gap-3 flex flex-col">
						<PostAsPicker
							value={postAs}
							onChange={setPostAs}
							i18nPrefix="admin.moderation.threads"
							disabled={reply.isPending}
						/>
						<Label htmlFor="thread-reply">{t("admin.moderation.threads.body")}</Label>
						<Textarea
							id="thread-reply"
							value={body}
							maxLength={5000}
							onChange={(event) => setBody(event.target.value)}
						/>
						<div>
							<Button onClick={onReply} disabled={!body.trim() || reply.isPending}>
								{t("admin.moderation.threads.send")}
							</Button>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
