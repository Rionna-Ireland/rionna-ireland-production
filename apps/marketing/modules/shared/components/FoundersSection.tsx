import Image from "next/image";

export interface Founder {
	name: string;
	role: string;
	bio: string;
	photoUrl?: string;
}

const initials = (name: string) =>
	name
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase() ?? "")
		.join("");

/** "The people" cards; renders nothing when the admin hasn't added founders. */
export function FoundersSection({ founders, label }: { founders: Founder[]; label: string }) {
	if (founders.length === 0) {
		return null;
	}
	return (
		<section className="gap-5 py-10 container flex flex-col">
			<span className="type-label text-plum">{label}</span>
			<div className="gap-6 md:grid-cols-2 max-w-4xl grid">
				{founders.map((f, i) => (
					<div
						key={`${f.name}-${i}`}
						className="gap-3 p-8 border-outline bg-white flex flex-col rounded-lg border"
					>
						<div className="size-24 bg-lilac-light text-plum text-xl relative flex items-center justify-center overflow-hidden rounded-full font-mono">
							{f.photoUrl ? (
								<Image
									unoptimized
									src={f.photoUrl}
									alt={f.name}
									fill
									sizes="96px"
									className="object-cover"
								/>
							) : (
								initials(f.name)
							)}
						</div>
						<h3 className="type-display-md">{f.name}</h3>
						<span className="type-label text-ink-variant">{f.role}</span>
						<p className="text-ink-variant">{f.bio}</p>
					</div>
				))}
			</div>
		</section>
	);
}
