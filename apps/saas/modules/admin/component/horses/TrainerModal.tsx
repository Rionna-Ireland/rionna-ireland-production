"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";

const trainerFormSchema = z.object({
	name: z.string().min(1),
	location: z.string().optional(),
});

interface TrainerModalProps {
	organizationId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: (trainer: { id: string; name: string }) => void;
}

export function TrainerModal({
	organizationId,
	open,
	onOpenChange,
	onCreated,
}: TrainerModalProps) {
	const t = useTranslations();

	const form = useForm({
		resolver: zodResolver(trainerFormSchema),
		defaultValues: {
			name: "",
			location: "",
		},
	});

	const createMutation = useMutation(
		orpc.admin.horses.trainers.create.mutationOptions(),
	);

	const onSubmit = form.handleSubmit(async (values) => {
		try {
			const trainer = await createMutation.mutateAsync({
				organizationId,
				name: values.name,
				location: values.location?.trim() || undefined,
			});
			toastSuccess(t("admin.horses.trainerModal.notifications.created"));
			form.reset();
			onCreated({ id: trainer.id, name: trainer.name });
			onOpenChange(false);
		} catch {
			toastError(t("admin.horses.trainerModal.notifications.error"));
		}
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("admin.horses.trainerModal.title")}</DialogTitle>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={onSubmit} className="gap-4 grid grid-cols-1">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										{t("admin.horses.trainerModal.name")}
									</FormLabel>
									<FormControl>
										<Input {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="location"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("admin.horses.trainerModal.location")}</FormLabel>
									<FormControl>
										<Input placeholder="Kildare" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => onOpenChange(false)}
							>
								{t("admin.horses.trainerModal.cancel")}
							</Button>
							<Button type="submit" loading={createMutation.isPending}>
								{t("admin.horses.trainerModal.save")}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
