import { acceptTerms } from "./procedures/accept-terms";
import { getLegalStatus } from "./procedures/get-legal-status";

/** S12-10 legal acceptance (T&C). */
export const legalRouter = {
	status: getLegalStatus,
	accept: acceptTerms,
};
