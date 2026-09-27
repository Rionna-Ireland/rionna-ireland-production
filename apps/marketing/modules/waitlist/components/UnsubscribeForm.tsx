"use client";

import { LocaleLink } from "@i18n/routing";
import { Button } from "@repo/ui/components/button";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import {
	unsubscribeFromWaitlist,
	type UnsubscribeWaitlistState,
} from "../actions/unsubscribe-waitlist";

const INITIAL_STATE: UnsubscribeWaitlistState = { status: "idle" };

export function UnsubscribeForm({ token }: { token: string }) {
	const t = useTranslations("waitlist.unsubscribe");
	const [state, formAction, pending] = useActionState(unsubscribeFromWaitlist, INITIAL_STATE);

	if (state.status === "done") {
		return (
			<div role="status" aria-live="polite">
				<h2 className="font-medium text-4xl leading-tight md:text-5xl font-display text-primary">
					{t("doneTitle")}
				</h2>
				<p className="mt-4 text-lg leading-relaxed text-muted-foreground">
					{t("doneBody")}
				</p>
				<LocaleLink
					href="/waitlist"
					className="mt-6 font-medium inline-block text-primary underline underline-offset-4"
				>
					{t("rejoin")}
				</LocaleLink>
			</div>
		);
	}

	return (
		<form action={formAction} className="gap-4 flex flex-col">
			<input type="hidden" name="token" value={token} />
			{state.status === "error" && (
				<p role="alert" className="text-sm text-destructive">
					{t("error")}
				</p>
			)}
			<div>
				<Button
					type="submit"
					variant="primary"
					size="lg"
					loading={pending}
					className="px-8 sm:w-auto w-full shadow-[inset_0_1px_0_rgba(252,249,242,0.16),inset_0_-1px_0_rgba(28,28,24,0.3)]"
				>
					{t("confirm")}
				</Button>
			</div>
		</form>
	);
}
