"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LocaleLink } from "@i18n/routing";
import { Button } from "@repo/ui/components/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { joinWaitlist } from "../actions/join-waitlist";
import { createWaitlistFieldsSchema, WAITLIST_HONEYPOT_FIELD } from "../lib/schema";
import { WAITLIST_JOINED_EVENT } from "./pattern/PatternMosaic";

// Night-panel field: translucent cream fill (--input) with a hairline that
// warms to lilac on focus; 2px focus ring with offset (§2b a11y guardrail).
const INPUT_CLASS =
	"h-12 rounded-none border-0 border-b border-foreground/25 bg-input px-4 text-base text-foreground shadow-none transition-colors placeholder:text-foreground/40 hover:border-foreground/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const LABEL_CLASS =
	"text-[11px] font-mono font-normal uppercase tracking-[0.2em] text-muted-foreground";

function readSourceFromLocation(): string | undefined {
	if (typeof window === "undefined") {
		return undefined;
	}
	return new URLSearchParams(window.location.search).get("src") ?? undefined;
}

export function WaitlistForm({ source }: { source?: string }) {
	const t = useTranslations("waitlist");
	const honeypotId = useId();
	const successRef = useRef<HTMLHeadingElement>(null);
	const [submitted, setSubmitted] = useState(false);

	const schema = useMemo(
		() =>
			createWaitlistFieldsSchema((code) => t(`form.errors.${code}`)).extend({
				[WAITLIST_HONEYPOT_FIELD]: z.string().optional(),
			}),
		[t],
	);

	const form = useForm({
		resolver: zodResolver(schema),
		defaultValues: {
			firstName: "",
			lastName: "",
			email: "",
			consent: false,
			[WAITLIST_HONEYPOT_FIELD]: "",
		},
	});

	useEffect(() => {
		if (submitted) {
			successRef.current?.focus();
		}
	}, [submitted]);

	const onSubmit = form.handleSubmit(async (values) => {
		try {
			const result = await joinWaitlist({
				...values,
				source: source ?? readSourceFromLocation(),
			});

			if (result.ok) {
				setSubmitted(true);
				// The pattern quilt ripples to lilac (PatternMosaic).
				window.dispatchEvent(new Event(WAITLIST_JOINED_EVENT));
				return;
			}

			if (result.error === "validation") {
				for (const [field, code] of Object.entries(result.fieldErrors)) {
					form.setError(field as keyof typeof result.fieldErrors, {
						message: t(`form.errors.${code}`),
					});
				}
				return;
			}

			form.setError("root", {
				message:
					result.error === "rate_limited"
						? t("form.errors.rateLimited")
						: t("form.errors.generic"),
			});
		} catch {
			form.setError("root", { message: t("form.errors.generic") });
		}
	});

	if (submitted) {
		return (
			<div role="status" aria-live="polite">
				<h2
					ref={successRef}
					tabIndex={-1}
					className="font-medium text-4xl leading-tight md:text-5xl font-display text-foreground outline-hidden"
				>
					{t("success.title")}
				</h2>
				<p className="mt-4 text-lg leading-relaxed text-muted-foreground">
					{t("success.body")}
				</p>
			</div>
		);
	}

	return (
		<Form {...form}>
			<form onSubmit={onSubmit} noValidate className="gap-5 relative flex flex-col">
				<div className="gap-5 sm:grid-cols-2 grid grid-cols-1">
					<FormField
						control={form.control}
						name="firstName"
						render={({ field }) => (
							<FormItem>
								<FormLabel className={LABEL_CLASS}>{t("form.firstName")}</FormLabel>
								<FormControl>
									<Input
										autoComplete="given-name"
										className={INPUT_CLASS}
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="lastName"
						render={({ field }) => (
							<FormItem>
								<FormLabel className={LABEL_CLASS}>{t("form.lastName")}</FormLabel>
								<FormControl>
									<Input
										autoComplete="family-name"
										className={INPUT_CLASS}
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>

				<FormField
					control={form.control}
					name="email"
					render={({ field }) => (
						<FormItem>
							<FormLabel className={LABEL_CLASS}>{t("form.email")}</FormLabel>
							<FormControl>
								<Input
									type="email"
									inputMode="email"
									autoComplete="email"
									className={INPUT_CLASS}
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="consent"
					render={({ field }) => (
						<FormItem>
							<div className="gap-3 flex items-start">
								<FormControl>
									<input
										type="checkbox"
										name={field.name}
										ref={field.ref}
										checked={field.value}
										onChange={(event) => field.onChange(event.target.checked)}
										onBlur={field.onBlur}
										className="mt-0.5 size-5 shrink-0 cursor-pointer accent-[#CCA1D0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
									/>
								</FormControl>
								<FormLabel className="font-normal text-sm leading-relaxed text-muted-foreground">
									{t.rich("form.consent", {
										link: (chunks) => (
											<LocaleLink
												href="/legal/privacy-policy"
												className="font-medium text-foreground underline decoration-[#CCA1D0] underline-offset-4"
											>
												{chunks}
											</LocaleLink>
										),
									})}
								</FormLabel>
							</div>
							<FormMessage />
						</FormItem>
					)}
				/>

				{/* Honeypot: off-screen (not display:none, which some bots skip) and hidden from assistive tech. */}
				<div
					aria-hidden="true"
					className="top-0 absolute -left-[10000px] h-px w-px overflow-hidden"
				>
					<label htmlFor={honeypotId}>{t("form.honeypot")}</label>
					<input
						id={honeypotId}
						type="text"
						tabIndex={-1}
						autoComplete="off"
						{...form.register(WAITLIST_HONEYPOT_FIELD)}
					/>
				</div>

				{form.formState.errors.root?.message && (
					<p role="alert" className="text-sm text-destructive">
						{form.formState.errors.root.message}
					</p>
				)}

				<div>
					<Button
						type="submit"
						variant="primary"
						size="lg"
						loading={form.formState.isSubmitting}
						className="wl-cta h-14 px-10 sm:w-auto text-base font-medium w-full rounded-full"
					>
						{t("form.submit")}
					</Button>
				</div>
			</form>
		</Form>
	);
}
