"use client";

import { v2Button } from "@shared/components/ui/v2";
import { useCookieConsent } from "@shared/hooks/cookie-consent";
import { useEffect, useState } from "react";

export function ConsentBanner() {
	const { userHasConsented, allowCookies, declineCookies } = useCookieConsent();
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return null;
	}

	if (userHasConsented) {
		return null;
	}

	return (
		<div className="consent-banner left-4 bottom-4 max-w-sm p-5 border-outline bg-white text-ink fixed z-50 rounded-lg border shadow-[0_8px_24px_-12px_rgb(23_39_65/0.25)]">
			<p className="text-sm leading-normal text-ink">
				We use essential cookies to keep the site running and optional ones to help us make
				it better. You can change your mind any time.
			</p>
			<div className="mt-4 gap-2 flex">
				<button
					type="button"
					className={`${v2Button({ variant: "secondary", size: "md" })} flex-1`}
					onClick={() => declineCookies()}
				>
					Decline
				</button>
				<button
					type="button"
					className={`${v2Button({ variant: "primary", size: "md" })} flex-1`}
					onClick={() => allowCookies()}
				>
					Allow
				</button>
			</div>
		</div>
	);
}
