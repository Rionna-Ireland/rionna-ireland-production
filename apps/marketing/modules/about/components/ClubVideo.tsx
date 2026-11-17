"use client";

import { useInView } from "@shared/components/motion/useInView";
import { useMotionOk } from "@shared/components/motion/useMotionOk";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/**
 * Poster-first looping footage (no-JS, Reduce Motion and Save-Data stay on the
 * poster). The video mounts after motion is allowed, fades in on canplay, and
 * plays only while the chapter is on screen.
 */
export function ClubVideo({ src, poster }: { src: string; poster?: string }) {
	const motionOk = useMotionOk();
	const [ready, setReady] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const playing = useInView(wrapRef, { once: false, threshold: 0, rootMargin: "0px" });

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		if (playing && motionOk) void video.play().catch(() => {});
		else video.pause();
	}, [playing, motionOk]);

	return (
		<div ref={wrapRef} aria-hidden="true" className="relative size-full">
			{poster && (
				<Image
					unoptimized={poster.startsWith("http")}
					src={poster}
					alt=""
					fill
					sizes="100vw"
					loading="lazy"
					className="object-cover"
				/>
			)}
			{/* Without a poster the video's first frame stands in, so it mounts even when motion is off. */}
			{(motionOk || !poster) && (
				<video
					ref={videoRef}
					className={`inset-0 absolute size-full object-cover transition-opacity duration-(--dur-reveal) ease-(--ease-out-editorial) ${ready || !poster ? "opacity-100" : "opacity-0"}`}
					src={src}
					poster={poster}
					preload="metadata"
					autoPlay={motionOk}
					muted
					loop
					playsInline
					aria-hidden="true"
					onCanPlay={() => setReady(true)}
				/>
			)}
		</div>
	);
}
