"use client";

import { useSession } from "@auth/hooks/use-session";
import { useActiveOrganization } from "@organizations/hooks/use-active-organization";
import { Button } from "@repo/ui/components/button";
import { toastError } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRightIcon } from "lucide-react";

const HEALTHY_STATUSES = new Set(["active", "trialing"]);

function formatCurrency(amountCents: number | null, currency: string) {
	if (amountCents == null) return "—";
	try {
		return new Intl.NumberFormat("en-IE", {
			style: "currency",
			currency: currency.toUpperCase(),
			minimumFractionDigits: 0,
			maximumFractionDigits: 2,
		}).format(amountCents / 100);
	} catch {
		return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
	}
}

function formatDate(value: Date | string | null | undefined) {
	if (!value) return "—";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "—";
	return new Intl.DateTimeFormat("en-IE", {
		day: "numeric",
		month: "long",
		year: "numeric",
	}).format(date);
}

function StatusPill({ status, cancelAtPeriodEnd }: { status: string; cancelAtPeriodEnd: boolean }) {
	const isHealthy = HEALTHY_STATUSES.has(status);
	const label = cancelAtPeriodEnd
		? "Due to be cancelled"
		: status === "active"
			? "Active"
			: status === "trialing"
				? "Trial"
				: status === "past_due"
					? "Payment failed"
					: status === "canceled"
						? "Canceled"
						: status.replace(/_/g, " ");
	return (
		<span
			className={
				cancelAtPeriodEnd
					? "bg-amber-100 px-3 py-1 text-amber-950 text-xs tracking-wide inline-flex items-center rounded-full font-mono uppercase"
					: isHealthy
						? "px-3 py-1 text-xs tracking-wide inline-flex items-center rounded-full bg-rionna-green-100 font-mono text-rionna-green-950 uppercase"
						: "px-3 py-1 text-xs tracking-wide inline-flex items-center rounded-full bg-rionna-pink-100 font-mono text-rionna-pink-950 uppercase"
			}
		>
			{label}
		</span>
	);
}

export function MembershipHero() {
	const { user } = useSession();
	const { activeOrganization } = useActiveOrganization();
	const clubName = activeOrganization?.name ?? "the club";
	const firstName = user?.name?.split(" ")[0] ?? "there";

	const { data: summary, isLoading } = useQuery(
		orpc.payments.getSubscriptionSummary.queryOptions(),
	);

	const portalMutation = useMutation(orpc.payments.createCustomerPortalLink.mutationOptions());

	const onManageBilling = async () => {
		if (!summary?.purchaseId) {
			toastError("We couldn't open the billing portal — please refresh and try again.");
			return;
		}
		try {
			const { customerPortalLink } = await portalMutation.mutateAsync({
				purchaseId: summary.purchaseId,
				redirectUrl: window.location.href,
			});
			window.location.assign(customerPortalLink);
		} catch {
			toastError("We couldn't open the billing portal — please try again in a moment.");
		}
	};

	const status = summary?.status ?? "active";
	const isHealthy = HEALTHY_STATUSES.has(status);
	const isCanceling = summary?.cancelAtPeriodEnd ?? false;
	const accessEndLabel = formatDate(summary?.accessEndsAt ?? summary?.currentPeriodEnd);

	const eyebrow = isCanceling
		? "CANCELLATION SCHEDULED"
		: isHealthy
			? "WELCOME"
			: "MEMBERSHIP NEEDS ATTENTION";
	const body = isCanceling
		? accessEndLabel === "—"
			? "Your membership is scheduled to end."
			: `Your membership stays active until ${accessEndLabel}.`
		: isHealthy
			? `You're a member of ${clubName}.`
			: "There's an issue with your membership — let's get it sorted.";

	const amountLabel =
		summary?.amount != null
			? `${formatCurrency(summary.amount, summary.currency)}${summary.interval ? ` / ${summary.interval}` : ""}`
			: "—";

	const planRow = summary?.planName ?? (isLoading ? "Loading…" : "Membership");
	const nextPaymentRow = summary?.cancelAtPeriodEnd
		? `Ends ${formatDate(summary.accessEndsAt ?? summary.currentPeriodEnd)}`
		: summary?.currentPeriodEnd
			? `${formatCurrency(summary.amount, summary.currency)} on ${formatDate(summary.currentPeriodEnd)}`
			: "—";
	const memberSinceRow = formatDate(summary?.memberSince);

	return (
		<section className="p-6 md:p-10 shadow-sm rounded-2xl bg-card">
			<div className="gap-4 flex items-start justify-between">
				<p className="text-xs tracking-wider font-mono text-muted-foreground uppercase">
					{eyebrow}
				</p>
				<StatusPill status={status} cancelAtPeriodEnd={isCanceling} />
			</div>

			<h2 className="mt-3 text-3xl md:text-5xl leading-tight font-display text-foreground">
				{firstName}.
			</h2>

			<p className="mt-4 md:text-lg max-w-2xl text-foreground/80">{body}</p>

			<dl className="mt-8 md:grid-cols-3 gap-6 grid grid-cols-1">
				<div>
					<dt className="text-xs tracking-wider font-mono text-muted-foreground uppercase">
						Plan
					</dt>
					<dd className="mt-2 text-foreground">
						<div>{planRow}</div>
						<div className="text-sm text-muted-foreground">{amountLabel}</div>
					</dd>
				</div>
				<div>
					<dt className="text-xs tracking-wider font-mono text-muted-foreground uppercase">
						{summary?.cancelAtPeriodEnd ? "Access ends" : "Next payment"}
					</dt>
					<dd className="mt-2 text-foreground">{nextPaymentRow}</dd>
				</div>
				<div>
					<dt className="text-xs tracking-wider font-mono text-muted-foreground uppercase">
						Member since
					</dt>
					<dd className="mt-2 text-foreground">{memberSinceRow}</dd>
				</div>
			</dl>

			<div className="mt-8">
				<Button
					onClick={onManageBilling}
					loading={portalMutation.isPending}
					className="rounded-full"
				>
					Manage billing
					<ArrowRightIcon className="ml-2 size-4" />
				</Button>
			</div>
		</section>
	);
}
