import { Submark } from "@shared/components/brand/Submark";
import { Wordmark } from "@shared/components/brand/Wordmark";

import { ArrivalSkip } from "./ArrivalSkip";

// Submark viewBox; the fill clip rect and the stroke width are in these units.
const VB_W = 440.19;
const VB_H = 396;
const SUBMARK_D = "arrival-fill-clip";

/** S16-02 C0: CSS-only first-load moment. Timeline lives in globals.css (.arrival-*). */
export function Arrival({ tagline = "Open the gates" }: { tagline?: string }) {
	return (
		<div
			data-arrival-overlay
			aria-hidden="true"
			className="arrival bg-welcome-navy grain inset-0 fixed isolate z-[60] flex items-center justify-center"
		>
			<div className="arrival-content gap-6 flex flex-col items-center">
				<div
					className="arrival-lockup relative w-[min(86vw,680px)]"
					style={{ aspectRatio: "2486.36 / 396" }}
				>
					{/* Lockup letters (the wordmark's own mark is clipped away; the drawn submark takes its place). */}
					<Wordmark className="arrival-letters inset-0 absolute size-full text-[#eeeadf]" />
					<div className="arrival-mark inset-y-0 left-0 absolute w-[17.7%]">
						<svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="size-full overflow-visible">
							<defs>
								<clipPath id={SUBMARK_D}>
									<rect
										className="arrival-fill-rect"
										width={VB_W}
										height={VB_H}
									/>
								</clipPath>
							</defs>
							<path
								className="arrival-fill"
								clipPath="url(#arrival-fill-clip)"
								fill="#eeeadf"
								d="M7 0C16.735 38.471 37.715 62.264 71.01 75.337L71.01 0L78 0C91.526 53.453 147.5 80.099 186.771 85.7C259.012 96.004 440.191 149.52 440.191 386L157.5 386L157.5 255.876C123.76 343.515 87.24 390.928 0 396L0 0L7 0Z"
							/>
							<path
								className="arrival-stroke"
								pathLength="1"
								fill="none"
								stroke="#eeeadf"
								strokeWidth="5"
								d="M7 0C16.735 38.471 37.715 62.264 71.01 75.337L71.01 0L78 0C91.526 53.453 147.5 80.099 186.771 85.7C259.012 96.004 440.191 149.52 440.191 386L157.5 386L157.5 255.876C123.76 343.515 87.24 390.928 0 396L0 0L7 0Z"
							/>
						</svg>
					</div>
				</div>
				<p className="arrival-tagline type-display-md">{tagline}</p>
			</div>
			<ArrivalSkip />
		</div>
	);
}
