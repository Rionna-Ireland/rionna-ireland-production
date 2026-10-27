/** A 2px ice line that fills with page scroll. CSS-only (globals.css); absent where scroll timelines are unsupported. */
export function ReadingProgress() {
	return <div aria-hidden="true" className="reading-progress" />;
}
