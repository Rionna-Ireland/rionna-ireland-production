"use client";

import { useAdminOrganization } from "@admin/hooks/use-admin-organization";
import { getAdminPath } from "@admin/lib/links";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Switch } from "@repo/ui/components/switch";
import { Textarea } from "@repo/ui/components/textarea";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { useConfirmationAlert } from "@shared/components/ConfirmationAlertProvider";
import { useRouter } from "@shared/hooks/router";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleIcon, Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PhotoGallery } from "./PhotoGallery";
import { ProviderHorseSearch } from "./ProviderHorseSearch";
import { TrainerModal } from "./TrainerModal";

const horseFormSchema = z.object({
	name: z.string().min(1),
	slug: z.string().optional(),
	status: z.enum(["PRE_TRAINING", "IN_TRAINING", "REHAB", "RETIRED", "SOLD"]),
	trainerId: z.string().optional(),
	sortOrder: z.coerce.number().min(0).default(0),
	providerEntityId: z.string().optional(),
	circleSpaceId: z.string().optional(),
	bio: z.string().optional(),
	trainerNotes: z.string().optional(),
	ownershipBlurb: z.string().optional(),
	sire: z.string().optional(),
	dam: z.string().optional(),
	damsire: z.string().optional(),
	published: z.boolean().default(false),
	publicProfile: z.boolean().default(false),
});

type HorseFormValues = z.infer<typeof horseFormSchema>;

interface HorseFormProps {
	horseId?: string;
}

export function HorseForm({ horseId }: HorseFormProps) {
	const t = useTranslations();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { confirm } = useConfirmationAlert();
	const { organizationId: orgId } = useAdminOrganization();
	const organizationId = orgId ?? "";

	const [trainerModalOpen, setTrainerModalOpen] = useState(false);
	const [photos, setPhotos] = useState<Array<{ url: string; caption: string }>>([]);

	const isEdit = !!horseId;

	const { data: horse, isLoading: horseLoading } = useQuery({
		...orpc.admin.horses.find.queryOptions({
			input: { horseId: horseId ?? "" },
		}),
		enabled: isEdit,
	});

	const { data: trainers, refetch: refetchTrainers } = useQuery({
		...orpc.admin.horses.trainers.list.queryOptions({
			input: { organizationId },
		}),
		enabled: !!organizationId,
	});

	const createMutation = useMutation(orpc.admin.horses.create.mutationOptions());
	const updateMutation = useMutation(orpc.admin.horses.update.mutationOptions());
	const deleteMutation = useMutation(orpc.admin.horses.delete.mutationOptions());
	const syncMutation = useMutation(orpc.admin.horses.sync.mutationOptions());
	const retryCircleSpaceMutation = useMutation(
		orpc.admin.horses.retryCircleSpace.mutationOptions(),
	);

	const pedigree = horse?.pedigree as
		| { sire?: string; dam?: string; damsire?: string }
		| null
		| undefined;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const form = useForm<HorseFormValues>({
		resolver: zodResolver(horseFormSchema) as any,
		defaultValues: {
			name: "",
			slug: "",
			status: "IN_TRAINING",
			trainerId: "",
			sortOrder: 0,
			providerEntityId: "",
			circleSpaceId: "",
			bio: "",
			trainerNotes: "",
			ownershipBlurb: "",
			sire: "",
			dam: "",
			damsire: "",
			published: false,
			publicProfile: false,
		},
	});

	useEffect(() => {
		if (horse) {
			form.reset({
				name: horse.name,
				slug: horse.slug,
				status: horse.status,
				trainerId: horse.trainerId ?? "",
				sortOrder: horse.sortOrder,
				providerEntityId: horse.providerEntityId ?? "",
				circleSpaceId: horse.circleSpaceId ?? "",
				bio: horse.bio ?? "",
				trainerNotes: horse.trainerNotes ?? "",
				ownershipBlurb: horse.ownershipBlurb ?? "",
				sire: pedigree?.sire ?? "",
				dam: pedigree?.dam ?? "",
				damsire: pedigree?.damsire ?? "",
				published: !!horse.publishedAt,
				publicProfile: !!horse.publicProfileAt,
			});
			setPhotos(
				Array.isArray(horse.photos)
					? (horse.photos as Array<{ url: string; caption: string }>)
					: [],
			);
		}
	}, [horse]); // eslint-disable-line react-hooks/exhaustive-deps

	const onSubmit = form.handleSubmit(async (values) => {
		try {
			const pedigreeData =
				values.sire || values.dam || values.damsire
					? { sire: values.sire, dam: values.dam, damsire: values.damsire }
					: undefined;

			if (isEdit && horseId) {
				await updateMutation.mutateAsync({
					horseId,
					name: values.name,
					slug: values.slug || undefined,
					status: values.status,
					trainerId: values.trainerId || null,
					sortOrder: values.sortOrder,
					providerEntityId: values.providerEntityId || null,
					circleSpaceId: values.circleSpaceId || null,
					bio: values.bio || null,
					trainerNotes: values.trainerNotes || null,
					ownershipBlurb: values.ownershipBlurb || null,
					pedigree: pedigreeData ?? null,
					photos: photos.length > 0 ? photos : null,
					publishedAt: values.published ? (horse?.publishedAt ?? new Date()) : null,
					publicProfileAt: values.publicProfile
						? (horse?.publicProfileAt ?? new Date())
						: null,
				});

				await queryClient.invalidateQueries({
					queryKey: orpc.admin.horses.find.key({ input: { horseId } }),
				});

				toastSuccess(t("admin.horses.form.notifications.updated"));
			} else {
				const created = await createMutation.mutateAsync({
					organizationId,
					name: values.name,
					slug: values.slug || undefined,
					status: values.status,
					trainerId: values.trainerId || undefined,
					sortOrder: values.sortOrder,
					providerEntityId: values.providerEntityId || undefined,
					circleSpaceId: values.circleSpaceId || undefined,
					bio: values.bio || undefined,
					trainerNotes: values.trainerNotes || undefined,
					ownershipBlurb: values.ownershipBlurb || undefined,
					pedigree: pedigreeData,
					publishedAt: values.published ? new Date() : null,
					publicProfileAt: values.publicProfile ? new Date() : null,
				});

				toastSuccess(t("admin.horses.form.notifications.created"));
				router.replace(getAdminPath(`/horses/${created.id}`));
			}

			await queryClient.invalidateQueries({
				queryKey: orpc.admin.horses.list.key(),
			});
		} catch {
			toastError(t("admin.horses.form.notifications.error"));
		}
	});

	const handleDelete = () => {
		if (!horseId) return;
		confirm({
			title: t("admin.horses.form.delete"),
			message: `Are you sure you want to delete ${horse?.name ?? "this horse"}? This action cannot be undone.`,
			confirmLabel: t("admin.horses.form.delete"),
			destructive: true,
			onConfirm: async () => {
				try {
					await deleteMutation.mutateAsync({ horseId });
					toastSuccess(t("admin.horses.form.notifications.deleted"));
					await queryClient.invalidateQueries({
						queryKey: orpc.admin.horses.list.key(),
					});
					router.replace(getAdminPath("/horses"));
				} catch {
					toastError(t("admin.horses.form.notifications.error"));
				}
			},
		});
	};

	const handleSync = async () => {
		if (!horseId) return;
		try {
			await syncMutation.mutateAsync({ horseId });
			await queryClient.invalidateQueries({
				queryKey: orpc.admin.horses.find.key({ input: { horseId } }),
			});
			toastSuccess(t("admin.horses.form.notifications.synced"));
		} catch {
			toastError(t("admin.horses.form.notifications.syncError"));
		}
	};

	const handlePublishToggle = (checked: boolean) => {
		if (checked && !form.getValues("published")) {
			confirm({
				title: t("admin.horses.form.publishConfirmTitle"),
				message: t("admin.horses.form.publishConfirmMessage", {
					name: form.getValues("name") || "this horse",
				}),
				confirmLabel: t("admin.horses.form.publishConfirmButton"),
				onConfirm: () => {
					form.setValue("published", true);
				},
			});
		} else {
			form.setValue("published", checked);
		}
	};

	const getSyncStatusIndicator = () => {
		if (!horse?.providerEntityId) return null;
		if (!horse.providerLastSync) {
			return (
				<span className="text-sm text-muted-foreground">
					{t("admin.horses.form.syncStatusUnlinked")}
				</span>
			);
		}
		const lastSync = new Date(horse.providerLastSync);
		const hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
		if (hoursSinceSync < 24) {
			return (
				<span className="gap-1 text-sm text-green-600 flex items-center">
					<CircleIcon className="size-2 fill-current" />
					{t("admin.horses.form.syncStatusLinked")}
				</span>
			);
		}
		return (
			<span className="gap-1 text-sm text-amber-600 flex items-center">
				<CircleIcon className="size-2 fill-current" />
				{t("admin.horses.form.syncStatusStale")}
			</span>
		);
	};

	const handleRetryCircleSpace = async () => {
		if (!horseId) return;
		try {
			await retryCircleSpaceMutation.mutateAsync({ horseId });
			await queryClient.invalidateQueries({
				queryKey: orpc.admin.horses.find.key({ input: { horseId } }),
			});
			toastSuccess(t("admin.horses.form.circleSpace.retrySuccess"));
		} catch {
			toastError(t("admin.horses.form.circleSpace.retryError"));
		}
	};

	const getCircleSpaceStatusIndicator = () => {
		if (!isEdit) return null;
		if (horse?.circleSpaceId) {
			return (
				<span className="gap-1 text-sm text-green-600 flex items-center">
					<CircleIcon className="size-2 fill-current" />
					{t("admin.horses.form.circleSpace.active")}
				</span>
			);
		}
		if (horse?.circleSpaceStatus === "provisioning_failed") {
			return (
				<div className="gap-2 text-sm text-amber-600 flex items-center">
					<CircleIcon className="size-2 fill-current" />
					{t("admin.horses.form.circleSpace.failed")}
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleRetryCircleSpace}
						loading={retryCircleSpaceMutation.isPending}
					>
						{t("admin.horses.form.circleSpace.retry")}
					</Button>
				</div>
			);
		}
		return (
			<span className="text-sm text-muted-foreground">
				{t("admin.horses.form.circleSpace.pending")}
			</span>
		);
	};

	if (isEdit && horseLoading) {
		return (
			<div className="py-12 flex items-center justify-center">
				<Loader2Icon className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="gap-4 grid grid-cols-1">
			<Card>
				<CardHeader>
					<CardTitle>
						{isEdit
							? t("admin.horses.form.updateTitle")
							: t("admin.horses.form.createTitle")}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form onSubmit={onSubmit} className="gap-6 grid grid-cols-1">
							{/* Core Fields */}
							<div className="gap-4 md:grid-cols-2 grid grid-cols-1">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("admin.horses.form.name")}</FormLabel>
											<FormControl>
												<Input {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="slug"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("admin.horses.form.slug")}</FormLabel>
											<FormControl>
												<Input {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="status"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("admin.horses.form.status")}</FormLabel>
											<Select
												value={field.value}
												onValueChange={field.onChange}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="PRE_TRAINING">
														{t("admin.horses.status.PRE_TRAINING")}
													</SelectItem>
													<SelectItem value="IN_TRAINING">
														{t("admin.horses.status.IN_TRAINING")}
													</SelectItem>
													<SelectItem value="REHAB">
														{t("admin.horses.status.REHAB")}
													</SelectItem>
													<SelectItem value="RETIRED">
														{t("admin.horses.status.RETIRED")}
													</SelectItem>
													<SelectItem value="SOLD">
														{t("admin.horses.status.SOLD")}
													</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="trainerId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>{t("admin.horses.form.trainer")}</FormLabel>
											<Select
												value={field.value || "none"}
												onValueChange={(value) => {
													if (value === "add_new") {
														setTrainerModalOpen(true);
													} else {
														field.onChange(
															value === "none" ? "" : value,
														);
													}
												}}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value="none">-</SelectItem>
													{trainers?.map((trainer) => (
														<SelectItem
															key={trainer.id}
															value={trainer.id}
														>
															{trainer.name}
														</SelectItem>
													))}
													<SelectItem value="add_new">
														{t("admin.horses.form.addTrainer")}
													</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="sortOrder"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("admin.horses.form.sortOrder")}
											</FormLabel>
											<FormControl>
												<Input type="number" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							{/* Timeform Linking */}
							<div className="space-y-2">
								<FormField
									control={form.control}
									name="providerEntityId"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												{t("admin.horses.form.providerEntityId")}
											</FormLabel>
											<FormDescription>
												{t("admin.horses.form.providerEntityIdHint")}
											</FormDescription>
											<div className="gap-2 flex">
												<FormControl>
													<ProviderHorseSearch
														value={field.value ?? ""}
														onChange={field.onChange}
													/>
												</FormControl>
												{isEdit && field.value && (
													<Button
														type="button"
														variant="outline"
														onClick={handleSync}
														disabled={syncMutation.isPending}
													>
														{syncMutation.isPending ? (
															<Loader2Icon className="mr-1.5 size-4 animate-spin" />
														) : null}
														{t("admin.horses.form.syncNow")}
													</Button>
												)}
											</div>
											{getSyncStatusIndicator()}
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							{/* Circle Discussion Linking */}
							<FormField
								control={form.control}
								name="circleSpaceId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("admin.horses.form.circleSpaceId")}
										</FormLabel>
										<FormDescription>
											{t("admin.horses.form.circleSpaceIdHint")}
										</FormDescription>
										<FormControl>
											<Input {...field} />
										</FormControl>
										{getCircleSpaceStatusIndicator()}
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Content Fields */}
							<FormField
								control={form.control}
								name="bio"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.horses.form.bio")}</FormLabel>
										<FormControl>
											<Textarea rows={4} {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="trainerNotes"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("admin.horses.form.trainerNotes")}</FormLabel>
										<FormControl>
											<Textarea rows={3} {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="ownershipBlurb"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											{t("admin.horses.form.ownershipBlurb")}
										</FormLabel>
										<FormControl>
											<Textarea rows={3} {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Pedigree */}
							<div>
								<h3 className="mb-3 font-medium">
									{t("admin.horses.form.pedigree")}
								</h3>
								<div className="gap-4 md:grid-cols-3 grid grid-cols-1">
									<FormField
										control={form.control}
										name="sire"
										render={({ field }) => (
											<FormItem>
												<FormLabel>{t("admin.horses.form.sire")}</FormLabel>
												<FormControl>
													<Input {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="dam"
										render={({ field }) => (
											<FormItem>
												<FormLabel>{t("admin.horses.form.dam")}</FormLabel>
												<FormControl>
													<Input {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="damsire"
										render={({ field }) => (
											<FormItem>
												<FormLabel>
													{t("admin.horses.form.damsire")}
												</FormLabel>
												<FormControl>
													<Input {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
							</div>

							{/* Photo Gallery */}
							<div>
								<h3 className="mb-3 font-medium">
									{t("admin.horses.form.photos")}
								</h3>
								<PhotoGallery
									horseId={horseId ?? null}
									photos={photos}
									onChange={setPhotos}
								/>
							</div>

							{/* Publish Toggle */}
							<FormField
								control={form.control}
								name="published"
								render={({ field }) => (
									<FormItem className="gap-3 flex items-center">
										<FormControl>
											<Switch
												checked={field.value}
												onCheckedChange={handlePublishToggle}
											/>
										</FormControl>
										<FormLabel className="!mt-0">
											{t("admin.horses.form.publishToggle")}
										</FormLabel>
									</FormItem>
								)}
							/>

							{/* Public Website Toggle */}
							<FormField
								control={form.control}
								name="publicProfile"
								render={({ field }) => (
									<FormItem className="gap-3 flex items-center">
										<FormControl>
											<Switch
												checked={field.value}
												onCheckedChange={field.onChange}
											/>
										</FormControl>
										<FormLabel className="!mt-0">
											{t("admin.horses.form.publicProfileToggle")}
										</FormLabel>
									</FormItem>
								)}
							/>

							{/* Actions */}
							<div className="flex justify-between">
								<div>
									{isEdit && (
										<Button
											type="button"
											variant="destructive"
											onClick={handleDelete}
											disabled={deleteMutation.isPending}
										>
											{t("admin.horses.form.delete")}
										</Button>
									)}
								</div>
								<Button
									type="submit"
									loading={createMutation.isPending || updateMutation.isPending}
								>
									{t("admin.horses.form.save")}
								</Button>
							</div>
						</form>
					</Form>
				</CardContent>
			</Card>

			<TrainerModal
				organizationId={organizationId}
				open={trainerModalOpen}
				onOpenChange={setTrainerModalOpen}
				onCreated={(trainer) => {
					void refetchTrainers();
					form.setValue("trainerId", trainer.id);
				}}
			/>
		</div>
	);
}
