"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { toastError } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { toSafeFilename } from "@shared/lib/safe-filename";
import { useMutation } from "@tanstack/react-query";
import { TrashIcon, UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";

interface AudioNote {
	url: string;
	caption: string;
}

interface AudioNoteGalleryProps {
	horseId: string | null;
	audioNotes: AudioNote[];
	onChange: (audioNotes: AudioNote[]) => void;
}

/**
 * Audio notes alongside the photo gallery (S8-01 §5/§6) — same signed-upload
 * flow as PhotoGallery, minus drag-reorder (a timeline of short clips doesn't
 * need manual ordering the way a hero photo set does).
 */
export function AudioNoteGallery({ horseId, audioNotes, onChange }: AudioNoteGalleryProps) {
	const t = useTranslations();

	const uploadUrlMutation = useMutation(orpc.admin.horses.createAudioUploadUrl.mutationOptions());

	const onDrop = useCallback(
		async (acceptedFiles: File[]) => {
			if (!horseId) return;

			const newNotes: AudioNote[] = [...audioNotes];

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

					newNotes.push({ url: publicUrl, caption: file.name });
				} catch {
					toastError("Failed to upload audio note");
				}
			}

			onChange(newNotes);
		},
		[horseId, audioNotes, onChange, uploadUrlMutation],
	);

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop,
		accept: {
			"audio/*": [".mp3", ".m4a", ".wav", ".aac", ".ogg"],
		},
		disabled: !horseId,
	});

	const handleCaptionChange = (index: number, caption: string) => {
		const updated = [...audioNotes];
		updated[index] = { ...updated[index], caption };
		onChange(updated);
	};

	const handleRemove = (index: number) => {
		onChange(audioNotes.filter((_, i) => i !== index));
	};

	return (
		<div className="space-y-4">
			{audioNotes.length > 0 && (
				<div className="gap-2 flex flex-col">
					{audioNotes.map((note, index) => (
						<div
							key={note.url}
							className="gap-2 p-2 sm:flex-row sm:items-center flex flex-col rounded-md border bg-card"
						>
							{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
							<audio src={note.url} controls className="h-10 sm:w-64" />
							<Input
								placeholder="Caption"
								value={note.caption}
								onChange={(e) => handleCaptionChange(index, e.target.value)}
								className="text-sm"
							/>
							<Button
								type="button"
								size="icon"
								variant="ghost"
								onClick={() => handleRemove(index)}
							>
								<TrashIcon className="size-4 text-destructive" />
							</Button>
						</div>
					))}
				</div>
			)}

			{!horseId ? (
				<p className="text-sm text-muted-foreground">
					{t("admin.horses.form.audioNotesDisabledHint")}
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
							? "Drop audio files here..."
							: "Drag & drop audio notes here, or click to select"}
					</p>
				</div>
			)}
		</div>
	);
}
