import { EmailVerification } from "./EmailVerification";
import { ForgotPassword } from "./ForgotPassword";
import { MagicLink } from "./MagicLink";
import { NewsNotification } from "./NewsNotification";
import { NewUser } from "./NewUser";
import { Notification } from "./Notification";
import { OrganizationInvitation } from "./OrganizationInvitation";
import { WaitlistLaunch } from "./WaitlistLaunch";
import { WelcomeMember } from "./WelcomeMember";

export const mailTemplates = {
	magicLink: MagicLink,
	forgotPassword: ForgotPassword,
	newUser: NewUser,
	organizationInvitation: OrganizationInvitation,
	emailVerification: EmailVerification,
	notification: Notification,
	welcomeMember: WelcomeMember,
	newsNotification: NewsNotification,
	waitlistLaunch: WaitlistLaunch,
} as const;
