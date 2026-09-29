"use client";

import { config } from "@config";
import { zodResolver } from "@hookform/resolvers/zod";
import { authClient } from "@repo/auth/client";
import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Form, FormField } from "@repo/ui/components/form";
import { CURRENT_TERMS_VERSION } from "@repo/utils";
import { orpcClient } from "@shared/lib/orpc-client";
import { AlertTriangleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { TermsCheckbox } from "./TermsCheckbox";

/**
 * S12-10 A3: the /accept-terms prompt for signed-in users who haven't accepted
 * the current terms version (existing users, invitees, version bumps).
 */
export function AcceptTermsForm({ redirectTo }: { redirectTo: string }) {
	const t = useTranslations();

	const formSchema = useMemo(
		() => z.object({ acceptTerms: z.literal(true, { error: t("legal.termsRequired") }) }),
		[t],
	);

	const form = useForm({
		resolver: zodResolver(formSchema),
		defaultValues: {
			// Unticked by default; the literal(true) schema makes it required.
			acceptTerms: false as unknown as true,
		},
	});

	const onSubmit = form.handleSubmit(async () => {
		try {
			await orpcClient.legal.accept({
				version: CURRENT_TERMS_VERSION,
				source: "web_prompt",
			});
			// Full navigation so the server-side gate re-evaluates with fresh data.
			window.location.assign(redirectTo);
		} catch {
			form.setError("root", { message: t("legal.acceptTerms.failed") });
		}
	});

	const onLogout = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					window.location.href = new URL(
						config.redirectAfterLogout,
						window.location.origin,
					).toString();
				},
			},
		});
	};

	return (
		<div>
			<h1 className="font-bold text-xl md:text-2xl">{t("legal.acceptTerms.title")}</h1>
			<p className="mt-1 mb-6 text-foreground/60">{t("legal.acceptTerms.message")}</p>

			<Form {...form}>
				<form className="gap-4 flex flex-col items-stretch" onSubmit={onSubmit}>
					{form.formState.errors.root && (
						<Alert variant="error">
							<AlertTriangleIcon />
							<AlertDescription>
								{form.formState.errors.root.message}
							</AlertDescription>
						</Alert>
					)}

					<FormField
						control={form.control}
						name="acceptTerms"
						render={({ field }) => <TermsCheckbox field={field} />}
					/>

					<Button variant="primary" loading={form.formState.isSubmitting}>
						{t("legal.acceptTerms.submit")}
					</Button>
				</form>
			</Form>

			<div className="mt-6 text-sm text-center">
				<button
					type="button"
					onClick={onLogout}
					className="text-foreground/60 underline underline-offset-4 hover:text-foreground"
				>
					{t("app.userMenu.logout")}
				</button>
			</div>
		</div>
	);
}
