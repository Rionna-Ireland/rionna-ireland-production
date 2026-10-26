"use client";

import { MediaPlaceholder } from "@shared/components/MediaPlaceholder";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/**
 * Poster-first strip media (the poster is the LCP element: SSR, `priority`, never
 * opacity-animated). The video mounts only when motion and data allow, crossfades
 * in on canplay, and pauses while the hero is off-screen.
 */
export function HeroMedia({
	imageUrl,
	videoUrl,
	unoptimized,
}: {
	imageUrl?: string;
	videoUrl?: string;
	/** Admin/DB URLs bypass the image optimiser; static public/ assets don't. */
	unoptimized: boolean;
}) {
	const [motionOk, setMotionOk] = useState(false);
	const [ready, setReady] = useState(false);
	const videoRef = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } })
			.connection?.saveData;
		setMotionOk(!window.matchMedia("(prefers-reduced-motion: reduce)").matches && !saveData);
	}, []);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		const observer = new IntersectionObserver(([entry]) => {
			if (entry?.isIntersecting) void video.play().catch(() => {});
			else video.pause();
		});
		observer.observe(video);
		return () => observer.disconnect();
	}, [motionOk]);

	return (
		<>
			{imageUrl ? (
				<div className="hero-poster relative size-full">
					<Image
						unoptimized={unoptimized}
						src={imageUrl}
						alt=""
						fill
						priority
						sizes="(min-width: 1024px) 20vw, 100vw"
						className="object-cover"
					/>
				</div>
			) : (
				<MediaPlaceholder tone="ice" className="inset-0 absolute h-full" />
			)}
			{motionOk && videoUrl && (
				<video
					ref={videoRef}
					className={`inset-0 absolute size-full object-cover transition-opacity duration-(--dur-reveal) ease-(--ease-out-editorial) ${ready ? "opacity-100" : "opacity-0"}`}
					src={videoUrl}
					poster={imageUrl}
					preload="metadata"
					autoPlay
					muted
					loop
					playsInline
					onCanPlay={() => setReady(true)}
				/>
			)}
		</>
	);
}
