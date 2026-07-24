import Link from "next/link";

interface CreatedPageProps {
	searchParams: Promise<{ slug?: string; id?: string }>;
}

function buildEnvChecklist(slug: string): string {
	const upper = slug.toUpperCase().replace(/-/g, "_");
	return `Next steps:

1. Set these env vars and redeploy (only these are read from env):

  CIRCLE_APP_TOKEN_${upper}=
  CIRCLE_HEADLESS_AUTH_TOKEN_${upper}=

2. Everything else lives on Organization.metadata (not env vars):

  circle.communityId, circle.communityDomain
  billing.stripePriceId
  racing.provider = "racing_api" | mock (Timeform is retired)`;
}

export default async function OrgCreatedPage({ searchParams }: CreatedPageProps) {
	const { slug = "", id = "" } = await searchParams;
	const checklist = buildEnvChecklist(slug || "your_slug");

	return (
		<div className="max-w-3xl mx-auto">
			<div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
				<strong>Legacy surface (D37).</strong> Rionna is a single-club platform —
				white-label/multi-org was descoped, so this create-org flow should not be
				needed in normal operation. It is kept for platform-admin emergencies only.
			</div>
			<header className="mb-6">
				<div className="text-amber-400 text-xs uppercase tracking-widest font-bold">
					Organization created
				</div>
				<h1 className="text-2xl font-bold text-zinc-50 mt-2">
					{slug ? `${slug}` : "New organization"} provisioned
				</h1>
				<p className="text-sm text-zinc-400 mt-1">
					The Organization row exists and the first admin invite is on its way.
					Finish the integration setup below.
				</p>
			</header>

			<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
				<h2 className="text-sm font-medium text-zinc-200 mb-3">
					Environment variables
				</h2>
				<pre className="bg-zinc-950 border border-zinc-800 rounded p-4 text-xs text-zinc-300 overflow-x-auto whitespace-pre">
					{checklist}
				</pre>
			</div>

			<div className="flex gap-3">
				{id ? (
					<Link
						href={`/platform/orgs/${id}`}
						className="text-sm px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium"
					>
						Open org detail
					</Link>
				) : null}
				<Link
					href="/platform/orgs"
					className="text-sm px-4 py-2 rounded-md border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
				>
					Back to organizations
				</Link>
			</div>
		</div>
	);
}
