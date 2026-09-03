import { createOffer } from "./procedures/admin/create-offer";
import { createOfferImageUploadUrl } from "./procedures/admin/create-offer-image-upload-url";
import { deleteOffer } from "./procedures/admin/delete-offer";
import { findOffer } from "./procedures/admin/find-offer";
import { listOffersAdmin } from "./procedures/admin/list-offers-admin";
import { updateOffer } from "./procedures/admin/update-offer";
import { listOffers } from "./procedures/list-offers";

export const paddockRouter = {
	listOffers,
	admin: {
		list: listOffersAdmin,
		find: findOffer,
		create: createOffer,
		update: updateOffer,
		delete: deleteOffer,
		createImageUploadUrl: createOfferImageUploadUrl,
	},
};
