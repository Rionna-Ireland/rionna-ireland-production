"use client";

import { MediaPlaceholder } from "@shared/components/MediaPlaceholder";
import Image from "next/image";
import { useEffect, useState } from "react";

/** SSR renders the image; the video mounts only after the client confirms motion is allowed. */
export function HeroMedia({ imageUrl, videoUrl }: { imageUrl?: string; videoUrl: string }) {
	const [motionOk, setMotionOk] = useState(false);
	useEffect(() => {
		setMotionOk(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
	}, []);

	return (
		<>
			{imageUrl ? (
				<Image
					unoptimized
					src={imageUrl}
					alt=""
					fill
					priority
					sizes="(min-width: 1024px) 50vw, 100vw"
					className="object-cover"
				/>
			) : (
				<MediaPlaceholder tone="ice" className="inset-0 absolute h-full" />
			)}
			{motionOk && (
				<video
					className="inset-0 absolute size-full object-cover"
					src={videoUrl}
					poster={imageUrl}
					preload="metadata"
					autoPlay
					muted
					loop
					playsInline
				/>
			)}
		</>
	);
}
