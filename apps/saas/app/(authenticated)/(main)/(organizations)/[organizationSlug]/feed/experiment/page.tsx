import { notFound } from "next/navigation";
import { CirclePostBody } from "@member-hub/components/CirclePostBody";
import { CircleTiptapRenderer } from "@member-hub/tiptap/CircleTiptapRenderer";
import { hydrateCircleDoc } from "@repo/payments/lib/circle/hydrate";
import { CORPUS } from "@member-hub/tiptap/__fixtures__/corpus";

export default function RendererExperimentPage() {
	if (process.env.NODE_ENV === "production") notFound();
	return (
		<div className="mx-auto max-w-5xl p-8">
			<h1 className="mb-8 font-bold text-2xl">Renderer A/B — old switch vs registry renderer</h1>
			{CORPUS.map((item) => {
				const tb = item.tiptapBody as { body?: unknown; sgids_to_object_map?: Record<string, unknown> };
				return (
					<section key={item.label} className="mb-12 border-muted border-t pt-6">
						<h2 className="mb-4 font-mono text-muted-foreground text-sm">{item.label}</h2>
						<div className="grid grid-cols-2 gap-8">
							<div>
								<p className="mb-2 text-xs uppercase">Old: CirclePostBody</p>
								<CirclePostBody doc={tb.body} embeds={tb.sgids_to_object_map ?? {}} />
							</div>
							<div>
								<p className="mb-2 text-xs uppercase">New: CircleTiptapRenderer</p>
								<CircleTiptapRenderer doc={hydrateCircleDoc(item.tiptapBody)} />
							</div>
						</div>
					</section>
				);
			})}
		</div>
	);
}
