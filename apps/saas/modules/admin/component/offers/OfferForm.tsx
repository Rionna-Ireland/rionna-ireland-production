"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { getAdminPath } from "@admin/lib/links";
import { useHydrateOnce } from "@admin/lib/use-hydrate-once";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
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
import { Spinner } from "@repo/ui/components/spinner";
import { Switch } from "@repo/ui/components/switch";
import { Textarea } from "@repo/ui/components/textarea";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { useRouter } from "@shared/hooks/router";
import { orpc } from "@shared/lib/orpc-query-utils";
import { toSafeFilename } from "@shared/lib/safe-filename";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import {
	EMPTY_OFFER_FORM,
	OFFER_CATEGORY_VALUES,
	type OfferFormValues,
	offerFormSchema,
	toOfferFormValues,
	toOfferPayload,
} from "./offer-form-values";

interface OfferFormProps {
	offerId?: string;
}

export function OfferForm({ offerId }: OfferFormProps) {
	const t = useTranslations();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { organizationId: orgId } = useAdminOrganization();
	const organizationId = orgId ?? "";
	const isEdit = !!offerId;
	const [isUploading, setIsUploading] = useState(false);

	const existing = useQuery({
		...orpc.paddock.admin.find.queryOptions({
			input: { organizationId, offerId: offerId ?? "" },
		}),
		enabled: isEdit && !!organizationId,
	});
	const create = useMutation(orpc.paddock.admin.create.mutationOptions());
	const update = useMutation(orpc.paddock.admin.update.mutationOptions());
	const uploadUrl = useMutation(orpc.paddock.admin.createImageUploadUrl.mutationOptions());

	const form = useForm<OfferFormValues>({
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		resolver: zodResolver(offerFormSchema) as any,
		defaultValues: EMPTY_OFFER_FORM,
	});

	const existingOffer = existing.data?.offer;
	useHydrateOnce(existingOffer?.id, form.formState.isDirty, () => {
		if (!existingOffer) return;
		form.reset(toOfferFormValues(existingOffer));
	});

	const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file || !organizationId) return;
		setIsUploading(true);
		try {
			const { signedUploadUrl, publicUrl } = await uploadUrl.mutateAsync({
				organizationId,
				filename: `${Date.now()}-${toSafeFilename(file.name)}`,
				fileSize: file.size,
			});
			const res = await fetch(signedUploadUrl, {
				method: "PUT",
				body: file,
				headers: { "Content-Type": file.type },
			});
			if (!res.ok) throw new Error("Upload failed");
			form.setValue("imageUrl", publicUrl, { shouldDirty: true });
		} catch {
			toastError(t("admin.offers.form.notifications.error"));
		} finally {
			setIsUploading(false);
		}
	};

	const onSubmit = form.handleSubmit(async (values) => {
		if (!organizationId) return;
		const payload = { organizationId, ...toOfferPayload(values) };
		try {
			const outcome =
				isEdit && offerId
					? await update.mutateAsync({ ...payload, offerId })
					: await create.mutateAsync(payload);
			if (!outcome.ok) throw new Error("not ok");
			await queryClient.invalidateQueries({ queryKey: orpc.paddock.admin.list.key() });
			toastSuccess(t("admin.offers.form.notifications.saved"));
			router.push(getAdminPath("/offers"));
		} catch {
			toastError(t("admin.offers.form.notifications.error"));
		}
	});

	if (isEdit && !organizationId) {
		return (
			<div className="p-8 flex items-center justify-center">
				<Spinner className="size-5" />
			</div>
		);
	}
	if (isEdit && existing.isSuccess && !existing.data.offer) {
		return <p className="text-muted-foreground">Offer not found.</p>;
	}

	const isPending = create.isPending || update.isPending || isUploading;

	return (
		<div className="space-y-6">
			<Button variant="link" size="sm" asChild className="px-0">
				<Link href={getAdminPath("/offers")}>
					<ArrowLeftIcon className="mr-1.5 size-4" />
					{t("admin.offers.form.backToList")}
				</Link>
			</Button>
			<Form {...form}>
				<form onSubmit={onSubmit} className="space-y-6">
					<Card>
						<CardHeader>
							<CardTitle>
								{isEdit
									? t("admin.offers.form.editTitle")
									: t("admin.offers.form.createTitle")}
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<FormField
								control={form.control}
								name="title"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.offers.form.title")}</FormLabel>
										<FormControl>
											<Input {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="partnerName"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.offers.form.partnerName")}</FormLabel>
										<FormControl>
											<Input {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="category"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.offers.form.category")}</FormLabel>
										<Select value={field.value} onValueChange={field.onChange}>
											<FormControl>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{OFFER_CATEGORY_VALUES.map((c) => (
													<SelectItem key={c} value={c}>
														{t(`admin.offers.form.categories.${c}`)}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="description"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.offers.form.description")}</FormLabel>
										<FormControl>
											<Textarea rows={4} {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="imageUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.offers.form.image")}</FormLabel>
										<FormControl>
											<div className="space-y-2">
												{field.value && (
													// eslint-disable-next-line @next/next/no-img-element
													<img
														src={field.value}
														alt=""
														className="max-h-48 rounded-md object-cover"
													/>
												)}
												<Input
													type="file"
													accept="image/*"
													onChange={handleImageUpload}
													disabled={isUploading}
												/>
											</div>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>{t("admin.offers.form.howToRedeem")}</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<FormField
								control={form.control}
								name="discountCode"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.offers.form.discountCode")}</FormLabel>
										<FormControl>
											<Input {...field} />
										</FormControl>
										<p className="text-xs text-muted-foreground">
											{t("admin.offers.form.discountCodeHelp")}
										</p>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="redeemUrl"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.offers.form.redeemUrl")}</FormLabel>
										<FormControl>
											<Input type="url" placeholder="https://" {...field} />
										</FormControl>
										<p className="text-xs text-muted-foreground">
											{t("admin.offers.form.redeemUrlHelp")}
										</p>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="howToRedeem"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.offers.form.howToRedeem")}</FormLabel>
										<FormControl>
											<Input {...field} />
										</FormControl>
										<p className="text-xs text-muted-foreground">
											{t("admin.offers.form.howToRedeemHelp")}
										</p>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="validUntil"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.offers.form.validUntil")}</FormLabel>
										<FormControl>
											<Input type="date" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="sortOrder"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.offers.form.sortOrder")}</FormLabel>
										<FormControl>
											<Input
												type="number"
												min={0}
												value={field.value}
												onChange={(e) =>
													field.onChange(Number(e.target.value) || 0)
												}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="active"
								render={({ field }) => (
									<FormItem className="gap-3 flex items-center">
										<FormControl>
											<Switch
												checked={field.value}
												onCheckedChange={field.onChange}
											/>
										</FormControl>
										<FormLabel className="!mt-0">
											{t("admin.offers.form.active")}
										</FormLabel>
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					<Button type="submit" disabled={isPending}>
						{isPending ? <Spinner className="mr-2 size-4" /> : null}
						{t("admin.offers.form.save")}
					</Button>
				</form>
			</Form>
		</div>
	);
}
