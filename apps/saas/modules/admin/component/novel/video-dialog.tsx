"use client";

import { Button } from "@repo/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Progress } from "@repo/ui/components/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { type EditorInstance, getUrlFromString } from "novel";
import { useState } from "react";

export type VideoUploadHandler = (file: File, onProgress?: (pct: number) => void) => Promise<string>;

interface VideoDialogProps {
	editor: EditorInstance | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** When provided, the modal offers an "Upload" tab (member-post composers).
	 * Absent (e.g. News) → paste-a-URL only. */
	onUploadVideo?: VideoUploadHandler;
}

/** Best-effort first-frame poster, drawn client-side. Returns undefined on failure. */
function generatePoster(file: File): Promise<string | undefined> {
	return new Promise((resolve) => {
		try {
			const video = document.createElement("video");
			const objectUrl = URL.createObjectURL(file);
			const done = (out?: string) => {
				URL.revokeObjectURL(objectUrl);
				resolve(out);
			};
			video.preload = "metadata";
			video.muted = true;
			video.src = objectUrl;
			video.onloadeddata = () => {
				video.currentTime = Math.min(0.1, video.duration || 0.1);
			};
			video.onseeked = () => {
				try {
					const canvas = document.createElement("canvas");
					canvas.width = video.videoWidth || 320;
					canvas.height = video.videoHeight || 180;
					const ctx = canvas.getContext("2d");
					if (!ctx) return done();
					ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
					done(canvas.toDataURL("image/jpeg", 0.7));
				} catch {
					done();
				}
			};
			video.onerror = () => done();
		} catch {
			resolve(undefined);
		}
	});
}

export function VideoDialog({ editor, open, onOpenChange, onUploadVideo }: VideoDialogProps) {
	const [url, setUrl] = useState("");
	const [progress, setProgress] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);

	function close() {
		setUrl("");
		setProgress(null);
		setError(null);
		onOpenChange(false);
	}

	function insertUrl() {
		const resolved = getUrlFromString(url);
		if (editor && resolved) {
			editor.chain().focus().setEmbed({ url: resolved }).run();
			close();
		}
	}

	async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file || !editor || !onUploadVideo) return;
		setError(null);
		setProgress(0);
		try {
			const [cdnUrl, poster] = await Promise.all([
				onUploadVideo(file, setProgress),
				generatePoster(file),
			]);
			editor.chain().focus().setEmbed({ url: cdnUrl, poster }).run();
			close();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Upload failed");
			setProgress(null);
		}
	}

	return (
		<Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add video</DialogTitle>
					<DialogDescription>
						Upload a video or paste a YouTube/Vimeo link. It plays inline in the published post.
					</DialogDescription>
				</DialogHeader>

				<Tabs defaultValue={onUploadVideo ? "upload" : "link"}>
					<TabsList>
						{onUploadVideo && <TabsTrigger value="upload">Upload</TabsTrigger>}
						<TabsTrigger value="link">Paste link</TabsTrigger>
					</TabsList>

					{onUploadVideo && (
						<TabsContent value="upload" className="space-y-3">
							<input
								type="file"
								accept="video/*"
								disabled={progress !== null}
								onChange={onPickFile}
								className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5"
							/>
							{progress !== null && (
								<div className="space-y-1">
									<Progress value={progress} />
									<p className="text-xs text-muted-foreground">Uploading… {progress}%</p>
								</div>
							)}
							{error && <p className="text-sm text-destructive">{error}</p>}
						</TabsContent>
					)}

					<TabsContent value="link" className="gap-2 flex">
						<Input
							placeholder="YouTube / Vimeo URL"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									insertUrl();
								}
							}}
						/>
						<Button type="button" onClick={insertUrl}>
							Add
						</Button>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
