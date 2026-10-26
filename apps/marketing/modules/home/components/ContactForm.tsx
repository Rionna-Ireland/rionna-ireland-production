"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertTitle } from "@repo/ui/components/alert";
import { PatternMosaic } from "@shared/components/pattern/PatternMosaic";
import { v2Button } from "@shared/components/ui/v2";
import { MailIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";

export function ContactForm() {
	const t = useTranslations();

	const form = useForm({
		resolver: zodResolver(
			z.object({
				name: z.string().min(1),
				email: z.email(),
				message: z.string().min(10),
			}),
		),
		defaultValues: {
			name: "",
			email: "",
			message: "",
		},
	});

	const onSubmit = form.handleSubmit(async (values) => {
		try {
			// TODO: Insert your contact form submission logic here to integrate with your CRM or email service
			console.log("Submitting contact form for values:", values);
			await new Promise((resolve) => setTimeout(resolve, 1000));
		} catch {
			form.setError("root", {
				message: t("contact.form.notifications.error"),
			});
		}
	});

	const fields = [
		{ name: "name", label: t("contact.form.name"), type: "text", autoComplete: "name" },
		{ name: "email", label: t("contact.form.email"), type: "email", autoComplete: "email" },
	] as const;

	// Floating label (shrinks when focused or filled) + an ink underline that draws from the left on focus.
	const input =
		"peer w-full bg-transparent pt-6 pb-2 text-base text-ink placeholder-transparent outline-none";
	const label =
		"pointer-events-none absolute left-0 top-4 origin-left text-base text-ink-variant transition-transform duration-(--dur-hover) ease-(--ease-out-editorial) peer-focus:-translate-y-3 peer-focus:scale-75 peer-not-placeholder-shown:-translate-y-3 peer-not-placeholder-shown:scale-75 motion-reduce:transition-none";
	const line =
		"absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-ink transition-transform duration-(--dur-hover) ease-(--ease-out-editorial) peer-focus:scale-x-100 motion-reduce:transition-none";
	const err = (name: "name" | "email" | "message") => form.formState.errors[name]?.message;

	if (form.formState.isSubmitSuccessful) {
		return (
			<div role="status" className="gap-6 sm:flex-row sm:items-center flex flex-col">
				<PatternMosaic
					colourway="navyLit"
					columns={3}
					rows={3}
					observe={false}
					className="w-40 shrink-0 rounded-lg"
				/>
				<p className="text-2xl text-ink font-display">
					{t("contact.form.notifications.success")}
				</p>
			</div>
		);
	}

	return (
		<form onSubmit={onSubmit} noValidate className="gap-6 flex flex-col items-stretch">
			{form.formState.errors.root?.message && (
				<Alert variant="error">
					<MailIcon />
					<AlertTitle>{form.formState.errors.root.message}</AlertTitle>
				</Alert>
			)}

			{fields.map((f) => (
				<div key={f.name}>
					<div className="border-outline relative border-b">
						<input
							{...form.register(f.name)}
							id={`contact-${f.name}`}
							type={f.type}
							autoComplete={f.autoComplete}
							placeholder={f.label}
							aria-invalid={!!err(f.name)}
							className={input}
						/>
						<label htmlFor={`contact-${f.name}`} className={label}>
							{f.label}
						</label>
						<span aria-hidden="true" className={line} />
					</div>
					{err(f.name) && <p className="mt-1 text-sm text-destructive">{err(f.name)}</p>}
				</div>
			))}

			<div>
				<div className="border-outline relative border-b">
					<textarea
						{...form.register("message")}
						id="contact-message"
						rows={5}
						placeholder={t("contact.form.message")}
						aria-invalid={!!err("message")}
						className={`${input} resize-none`}
					/>
					<label htmlFor="contact-message" className={label}>
						{t("contact.form.message")}
					</label>
					<span aria-hidden="true" className={line} />
				</div>
				{err("message") && (
					<p className="mt-1 text-sm text-destructive">{err("message")}</p>
				)}
			</div>

			<button
				type="submit"
				className={`${v2Button({ variant: "primary" })} w-full disabled:opacity-60`}
				disabled={form.formState.isSubmitting}
			>
				{t("contact.form.submit")}
			</button>
		</form>
	);
}
