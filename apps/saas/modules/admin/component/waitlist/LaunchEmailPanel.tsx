"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";

import {
	EMPTY_LAUNCH_FORM,
	LAUNCH_CONFIRM_WORD,
	type LaunchFormValues,
	launchFormSchema,
	recipientsForRun,
	toLaunchContent,
	toMaxToSend,
} from "./launch-form-values";

interface LaunchEmailPanelProps {
	organizationId: string;
	/** Subscribed signups that haven't had the launch email yet. */
	pending: number;
}

/**
 * S12-09 Phase 2: compose the launch email, send a test to yourself, then do
 * the real send behind a typed confirmation. Re-running resumes where the
 * last run stopped (server stamps `launchEmailSentAt` per sent chunk).
 */
export function LaunchEmailPanel({ organizationId, pending }: LaunchEmailPanelProps) {
	const t = useTranslations();
	const queryClient = useQueryClient();
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [confirmText, setConfirmText] = useState("");

	const form = useForm<LaunchFormValues>({
		resolver: zodResolver(launchFormSchema),
		defaultValues: EMPTY_LAUNCH_FORM,
	});

	const testMutation = useMutation(orpc.waitlist.admin.sendLaunchTest.mutationOptions());
	const sendMutation = useMutation(orpc.waitlist.admin.sendLaunch.mutationOptions());

	const recipients = recipientsForRun(pending, toMaxToSend(form.watch()));

	const handleSendTest = form.handleSubmit((values) => {
		testMutation.mutate(
			{ organizationId, ...toLaunchContent(values) },
			{
				onSuccess: (data) =>
					toastSuccess(t("admin.waitlist.launch.testSent", { email: data.to })),
				onError: (error) => toastError(t("admin.waitlist.launch.testError"), error.message),
			},
		);
	});

	const handleOpenConfirm = form.handleSubmit(() => {
		setConfirmText("");
		setConfirmOpen(true);
	});

	function handleSend() {
		const values = form.getValues();
		const maxToSend = toMaxToSend(values);
		sendMutation.mutate(
			{ organizationId, ...toLaunchContent(values), ...(maxToSend ? { maxToSend } : {}) },
			{
				onSuccess: async (data) => {
					setConfirmOpen(false);
					await queryClient.invalidateQueries({
						queryKey: orpc.waitlist.admin.stats.key(),
					});
					if (data.failedChunks > 0) {
						toastError(
							t("admin.waitlist.launch.partialTitle"),
							t("admin.waitlist.launch.result", data),
						);
					} else {
						toastSuccess(t("admin.waitlist.launch.result", data));
					}
				},
				onError: (error) => toastError(t("admin.waitlist.launch.sendError"), error.message),
			},
		);
	}

	const busy = testMutation.isPending || sendMutation.isPending;

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("admin.waitlist.launch.title")}</CardTitle>
				<p className="text-sm text-muted-foreground">
					{t("admin.waitlist.launch.subtitle", { count: pending })}
				</p>
			</CardHeader>
			<CardContent>
				<Form {...form}>
					<form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
						<FormField
							control={form.control}
							name="subject"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("admin.waitlist.launch.subject")}</FormLabel>
									<FormControl>
										<Input {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="heading"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("admin.waitlist.launch.heading")}</FormLabel>
									<FormControl>
										<Input {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="body"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("admin.waitlist.launch.body")}</FormLabel>
									<FormControl>
										<Textarea rows={8} {...field} />
									</FormControl>
									<FormDescription>
										{t("admin.waitlist.launch.bodyHint")}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="gap-4 sm:grid-cols-2 grid">
							<FormField
								control={form.control}
								name="ctaUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.waitlist.launch.ctaUrl")}</FormLabel>
										<FormControl>
											<Input type="url" placeholder="https://" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="maxToSend"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("admin.waitlist.launch.maxToSend")}
										</FormLabel>
										<FormControl>
											<Input inputMode="numeric" {...field} />
										</FormControl>
										<FormDescription>
											{t("admin.waitlist.launch.maxToSendHint")}
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className="gap-2 flex flex-wrap justify-end">
							<Button
								type="button"
								variant="outline"
								onClick={handleSendTest}
								disabled={busy}
							>
								{testMutation.isPending && (
									<Loader2Icon className="mr-1.5 size-4 animate-spin" />
								)}
								{t("admin.waitlist.launch.sendTest")}
							</Button>
							<Button
								type="button"
								variant="destructive"
								onClick={handleOpenConfirm}
								disabled={busy || pending === 0}
							>
								{t("admin.waitlist.launch.send")}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>

			<Dialog
				open={confirmOpen}
				onOpenChange={(next) => !sendMutation.isPending && setConfirmOpen(next)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("admin.waitlist.launch.confirmTitle")}</DialogTitle>
						<DialogDescription>
							{t("admin.waitlist.launch.confirmDescription", { count: recipients })}
						</DialogDescription>
					</DialogHeader>
					<div className="gap-1.5 py-1 flex flex-col">
						<label htmlFor="confirm-launch-send" className="text-sm">
							{t("admin.waitlist.launch.confirmLabel", { word: LAUNCH_CONFIRM_WORD })}
						</label>
						<Input
							id="confirm-launch-send"
							value={confirmText}
							onChange={(event) => setConfirmText(event.target.value)}
							autoComplete="off"
						/>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setConfirmOpen(false)}
							disabled={sendMutation.isPending}
						>
							{t("admin.waitlist.launch.cancel")}
						</Button>
						<Button
							variant="destructive"
							onClick={handleSend}
							disabled={
								confirmText.trim() !== LAUNCH_CONFIRM_WORD || sendMutation.isPending
							}
						>
							{sendMutation.isPending && (
								<Loader2Icon className="mr-1.5 size-4 animate-spin" />
							)}
							{sendMutation.isPending
								? t("admin.waitlist.launch.sending")
								: t("admin.waitlist.launch.confirmSubmit", { count: recipients })}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	);
}
