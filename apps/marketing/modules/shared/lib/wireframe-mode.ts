import { config } from "@config";
import { localeRedirect } from "@i18n/routing";

export function redirectIfWireframeMode(locale: string) {
	if (config.wireframeMode) {
		localeRedirect({ href: "/", locale });
	}
}
