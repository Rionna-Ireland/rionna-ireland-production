"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@repo/ui/components/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const clubSettingsSchema = z.object({
	brand: z.object({
		primaryColor: z.string().optional(),
		logoUrl: z.string().optional(),
		fontFamily: z.string().optional(),
	}),
	contact: z.object({
		aboutText: z.string().optional(),
		contactEmail: z.string().optional(),
		phone: z.string().optional(),
		address: z.string().optional(),
		socialLinks: z.object({
			website: z.string().optional(),
			instagram: z.string().optional(),
			twitter: z.string().optional(),
			facebook: z.string().optional(),
		}),
	}),
});

type ClubSettingsValues = z.infer<typeof clubSettingsSchema>;

const FONT_OPTIONS = [
	{ label: "PP Eiko", value: "PP Eiko" },
	{ label: "Plus Jakarta Sans", value: "Plus Jakarta Sans" },
	{ label: "IBM Plex Mono", value: "IBM Plex Mono" },
];

export function ClubSettingsForm() {
	const t = useTranslations();
	const { organizationId } = useAdminOrganization();

	const { data: settings, isLoading } = useQuery(
		orpc.settings.get.queryOptions({
			input: { organizationId: organizationId ?? "" },
			enabled: !!organizationId,
		}),
	);

	const updateMutation = useMutation(
		orpc.settings.update.mutationOptions(),
	);

	const uploadUrlMutation = useMutation(
		orpc.settings.createBrandUploadUrl.mutationOptions(),
	);

	const fileInputRef = useRef<HTMLInputElement>(null);

	const form = useForm<ClubSettingsValues>({
		resolver: zodResolver(clubSettingsSchema),
		defaultValues: {
			brand: {
				primaryColor: "",
				logoUrl: "",
				fontFamily: "",
			},
			contact: {
				aboutText: "",
				contactEmail: "",
				phone: "",
				address: "",
				socialLinks: {
					website: "",
					instagram: "",
					twitter: "",
					facebook: "",
				},
			},
		},
	});

	useEffect(() => {
		if (settings) {
			form.reset({
				brand: {
					primaryColor: settings.brand?.primaryColor ?? "",
					logoUrl: settings.brand?.logoUrl ?? "",
					fontFamily: settings.brand?.fontFamily ?? "",
				},
				contact: {
					aboutText: settings.contact?.aboutText ?? "",
					contactEmail: settings.contact?.contactEmail ?? "",
					phone: settings.contact?.phone ?? "",
					address: settings.contact?.address ?? "",
					socialLinks: {
						website: settings.contact?.socialLinks?.website ?? "",
						instagram: settings.contact?.socialLinks?.instagram ?? "",
						twitter: settings.contact?.socialLinks?.twitter ?? "",
						facebook: settings.contact?.socialLinks?.facebook ?? "",
					},
				},
			});
		}
	}, [settings, form]);

	const onSubmit = form.handleSubmit(async (values) => {
		if (!organizationId) return;

		try {
			await updateMutation.mutateAsync({
				organizationId,
				brand: values.brand,
				contact: {
					...values.contact,
					socialLinks: values.contact.socialLinks,
				},
			});

			toastSuccess(t("admin.settings.notifications.success"));
		} catch {
			toastError(t("admin.settings.notifications.error"));
		}
	});

	async function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file || !organizationId) return;

		const ext = file.name.split(".").pop() ?? "png";
		const filename = `logo.${ext}`;

		try {
			const { signedUploadUrl, publicUrl } = await uploadUrlMutation.mutateAsync({
				organizationId,
				filename,
			});

			const uploadResponse = await fetch(signedUploadUrl, {
				method: "PUT",
				body: file,
				headers: { "Content-Type": file.type },
			});

			if (!uploadResponse.ok) {
				throw new Error("Upload failed");
			}

			form.setValue("brand.logoUrl", publicUrl, { shouldDirty: true });
			toastSuccess(t("admin.settings.brand.logoUploaded"));
		} catch {
			toastError(t("admin.settings.brand.logoUploadError"));
		}
	}

	if (!organizationId) {
		return null;
	}

	if (isLoading) {
		return (
			<div className="text-muted-foreground text-sm">
				{t("admin.settings.loading")}
			</div>
		);
	}

	return (
		<div className="gap-4 grid grid-cols-1">
			<Form {...form}>
				<form onSubmit={onSubmit} className="gap-4 grid grid-cols-1">
					{/* Brand Settings */}
					<Card>
						<CardHeader>
							<CardTitle>{t("admin.settings.brand.title")}</CardTitle>
						</CardHeader>
						<CardContent className="gap-4 grid grid-cols-1">
							<FormField
								control={form.control}
								name="brand.primaryColor"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("admin.settings.brand.primaryColor")}
										</FormLabel>
										<FormControl>
											<div className="flex items-center gap-2">
												<input
													type="color"
													value={field.value || "#000000"}
													onChange={(e) => field.onChange(e.target.value)}
													className="h-9 w-12 cursor-pointer rounded border border-input"
												/>
												<Input
													{...field}
													value={field.value ?? ""}
													placeholder="#000000"
													className="flex-1"
												/>
											</div>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormItem>
								<FormLabel>{t("admin.settings.brand.logo")}</FormLabel>
								<div className="flex items-center gap-3">
									{form.watch("brand.logoUrl") && (
										<span className="text-muted-foreground text-sm">
											{form.watch("brand.logoUrl")}
										</span>
									)}
									<input
										ref={fileInputRef}
										type="file"
										accept="image/*"
										onChange={handleLogoUpload}
										className="hidden"
									/>
									<Button
										type="button"
										variant="outline"
										onClick={() => fileInputRef.current?.click()}
										loading={uploadUrlMutation.isPending}
									>
										{t("admin.settings.brand.uploadLogo")}
									</Button>
								</div>
							</FormItem>

							<FormField
								control={form.control}
								name="brand.fontFamily"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("admin.settings.brand.fontFamily")}
										</FormLabel>
										<Select
											onValueChange={field.onChange}
											value={field.value ?? ""}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue
														placeholder={t(
															"admin.settings.brand.selectFont",
														)}
													/>
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{FONT_OPTIONS.map((font) => (
													<SelectItem
														key={font.value}
														value={font.value}
													>
														{font.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					{/* About / Contact */}
					<Card>
						<CardHeader>
							<CardTitle>{t("admin.settings.contact.title")}</CardTitle>
						</CardHeader>
						<CardContent className="gap-4 grid grid-cols-1">
							<FormField
								control={form.control}
								name="contact.aboutText"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("admin.settings.contact.aboutText")}
										</FormLabel>
										<FormControl>
											<Textarea
												{...field}
												value={field.value ?? ""}
												rows={4}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="contact.contactEmail"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("admin.settings.contact.email")}
										</FormLabel>
										<FormControl>
											<Input
												{...field}
												value={field.value ?? ""}
												type="email"
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="contact.phone"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("admin.settings.contact.phone")}
										</FormLabel>
										<FormControl>
											<Input {...field} value={field.value ?? ""} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="contact.address"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("admin.settings.contact.address")}
										</FormLabel>
										<FormControl>
											<Textarea
												{...field}
												value={field.value ?? ""}
												rows={2}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					{/* Social Links */}
					<Card>
						<CardHeader>
							<CardTitle>{t("admin.settings.social.title")}</CardTitle>
						</CardHeader>
						<CardContent className="gap-4 grid grid-cols-1">
							<FormField
								control={form.control}
								name="contact.socialLinks.website"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("admin.settings.social.website")}
										</FormLabel>
										<FormControl>
											<Input
												{...field}
												value={field.value ?? ""}
												placeholder="https://"
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="contact.socialLinks.instagram"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("admin.settings.social.instagram")}
										</FormLabel>
										<FormControl>
											<Input {...field} value={field.value ?? ""} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="contact.socialLinks.twitter"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("admin.settings.social.twitter")}
										</FormLabel>
										<FormControl>
											<Input {...field} value={field.value ?? ""} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="contact.socialLinks.facebook"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("admin.settings.social.facebook")}
										</FormLabel>
										<FormControl>
											<Input {...field} value={field.value ?? ""} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					{/* Save Button */}
					<div className="flex justify-end">
						<Button
							type="submit"
							loading={updateMutation.isPending}
						>
							{t("settings.save")}
						</Button>
					</div>
				</form>
			</Form>

			{/* Racing Provider (read-only) */}
			<Card>
				<CardHeader>
					<CardTitle>{t("admin.settings.racing.title")}</CardTitle>
				</CardHeader>
				<CardContent className="gap-2 grid grid-cols-1">
					<div className="text-sm">
						<span className="font-medium">
							{t("admin.settings.racing.provider")}:
						</span>{" "}
						{settings?.racing?.provider ?? "N/A"}
					</div>
					{settings?.racing?.providerConfig?.subscriptionTier && (
						<div className="text-sm">
							<span className="font-medium">
								{t("admin.settings.racing.tier")}:
							</span>{" "}
							{settings.racing.providerConfig.subscriptionTier}
						</div>
					)}
					<p className="text-muted-foreground text-sm">
						{t("admin.settings.racing.managed")}
					</p>
				</CardContent>
			</Card>

			{/* Billing (read-only) */}
			<Card>
				<CardHeader>
					<CardTitle>{t("admin.settings.billing.title")}</CardTitle>
				</CardHeader>
				<CardContent className="gap-2 grid grid-cols-1">
					<div className="text-sm">
						<span className="font-medium">
							{t("admin.settings.billing.stripeProductId")}:
						</span>{" "}
						{settings?.billing?.stripeProductId ?? "N/A"}
					</div>
					<p className="text-muted-foreground text-sm">
						{t("admin.settings.billing.managed")}
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
