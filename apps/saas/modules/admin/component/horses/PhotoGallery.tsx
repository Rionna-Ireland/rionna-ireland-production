"use client";

import {
	DndContext,
	type DragEndEvent,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	arrayMove,
	horizontalListSortingStrategy,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { toastError } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { toSafeFilename } from "@shared/lib/safe-filename";
import { useMutation } from "@tanstack/react-query";
import { GripVerticalIcon, TrashIcon, UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";

interface Photo {
	url: string;
	caption: string;
}

interface PhotoGalleryProps {
	horseId: string | null;
	photos: Photo[];
	onChange: (photos: Photo[]) => void;
}

function SortablePhoto({
	photo,
	index,
	onCaptionChange,
	onRemove,
}: {
	photo: Photo;
	index: number;
	onCaptionChange: (index: number, caption: string) => void;
	onRemove: (index: number) => void;
}) {
	const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
		id: photo.url,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className="gap-2 p-2 flex flex-col rounded-md border bg-card"
		>
			<div className="gap-2 relative flex items-start">
				<button
					type="button"
					className="mt-1 cursor-grab touch-none text-muted-foreground"
					{...attributes}
					{...listeners}
				>
					<GripVerticalIcon className="size-4" />
				</button>
				<Image
					src={photo.url}
					alt={photo.caption || `Photo ${index + 1}`}
					width={120}
					height={80}
					className="h-20 w-30 rounded object-cover"
				/>
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className="right-0 top-0 absolute"
					onClick={() => onRemove(index)}
				>
					<TrashIcon className="size-4 text-destructive" />
				</Button>
			</div>
			<Input
				placeholder="Caption"
				value={photo.caption}
				onChange={(e) => onCaptionChange(index, e.target.value)}
				className="text-sm"
			/>
		</div>
	);
}

export function PhotoGallery({ horseId, photos, onChange }: PhotoGalleryProps) {
	const t = useTranslations();

	const sensors = useSensors(useSensor(PointerSensor));

	const uploadUrlMutation = useMutation(orpc.admin.horses.createPhotoUploadUrl.mutationOptions());

	const onDrop = useCallback(
		async (acceptedFiles: File[]) => {
			if (!horseId) return;

			const newPhotos: Photo[] = [...photos];

			for (const file of acceptedFiles) {
				try {
					const { signedUploadUrl, publicUrl } = await uploadUrlMutation.mutateAsync({
						horseId,
						filename: `${Date.now()}-${toSafeFilename(file.name)}`,
						fileSize: file.size,
					});

					const uploadResponse = await fetch(signedUploadUrl, {
						method: "PUT",
						body: file,
						headers: {
							"Content-Type": file.type,
						},
					});

					if (!uploadResponse.ok) {
						throw new Error("Upload failed");
					}

					// Stored as the public Supabase object URL (public media bucket) so it
					// renders in both the saas and the public marketing app — no proxy.
					newPhotos.push({ url: publicUrl, caption: "" });
				} catch {
					toastError("Failed to upload photo");
				}
			}

			onChange(newPhotos);
		},
		[horseId, photos, onChange, uploadUrlMutation],
	);

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop,
		accept: {
			"image/*": [".jpg", ".jpeg", ".png", ".webp"],
		},
		disabled: !horseId,
	});

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;

		const oldIndex = photos.findIndex((p) => p.url === active.id);
		const newIndex = photos.findIndex((p) => p.url === over.id);

		if (oldIndex !== -1 && newIndex !== -1) {
			onChange(arrayMove(photos, oldIndex, newIndex));
		}
	};

	const handleCaptionChange = (index: number, caption: string) => {
		const updated = [...photos];
		updated[index] = { ...updated[index], caption };
		onChange(updated);
	};

	const handleRemove = (index: number) => {
		const updated = photos.filter((_, i) => i !== index);
		onChange(updated);
	};

	return (
		<div className="space-y-4">
			{photos.length > 0 && (
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragEnd={handleDragEnd}
				>
					<SortableContext
						items={photos.map((p) => p.url)}
						strategy={horizontalListSortingStrategy}
					>
						<div className="gap-4 flex flex-wrap">
							{photos.map((photo, index) => (
								<SortablePhoto
									key={photo.url}
									photo={photo}
									index={index}
									onCaptionChange={handleCaptionChange}
									onRemove={handleRemove}
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>
			)}

			{!horseId ? (
				<p className="text-sm text-muted-foreground">
					{t("admin.horses.form.photosDisabledHint")}
				</p>
			) : (
				<div
					{...getRootProps()}
					className={`p-8 cursor-pointer rounded-md border-2 border-dashed text-center transition-colors ${
						isDragActive
							? "border-primary bg-primary/5"
							: "border-muted-foreground/25 hover:border-primary/50"
					}`}
				>
					<input {...getInputProps()} />
					<UploadIcon className="mb-2 size-8 mx-auto text-muted-foreground" />
					<p className="text-sm text-muted-foreground">
						{isDragActive
							? "Drop photos here..."
							: "Drag & drop photos here, or click to select"}
					</p>
				</div>
			)}
		</div>
	);
}
