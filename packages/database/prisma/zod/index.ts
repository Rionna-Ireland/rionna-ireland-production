/**
 * Prisma Zod Generator - Single File (inlined)
 * Auto-generated. Do not edit.
 */

import * as z from 'zod';
import { Prisma } from '../generated/client';
// File: TransactionIsolationLevel.schema.ts

export const TransactionIsolationLevelSchema = z.enum(['ReadUncommitted', 'ReadCommitted', 'RepeatableRead', 'Serializable'])

export type TransactionIsolationLevel = z.infer<typeof TransactionIsolationLevelSchema>;

// File: UserScalarFieldEnum.schema.ts

export const UserScalarFieldEnumSchema = z.enum(['id', 'name', 'email', 'emailVerified', 'image', 'createdAt', 'updatedAt', 'username', 'role', 'banned', 'banReason', 'banExpires', 'onboardingComplete', 'paymentsCustomerId', 'locale', 'displayUsername', 'twoFactorEnabled', 'lastActiveOrganizationId', 'pushEnabled', 'pushPreferences', 'emailPreferences'])

export type UserScalarFieldEnum = z.infer<typeof UserScalarFieldEnumSchema>;

// File: SessionScalarFieldEnum.schema.ts

export const SessionScalarFieldEnumSchema = z.enum(['id', 'expiresAt', 'ipAddress', 'userAgent', 'userId', 'impersonatedBy', 'activeOrganizationId', 'token', 'createdAt', 'updatedAt'])

export type SessionScalarFieldEnum = z.infer<typeof SessionScalarFieldEnumSchema>;

// File: AccountScalarFieldEnum.schema.ts

export const AccountScalarFieldEnumSchema = z.enum(['id', 'accountId', 'providerId', 'userId', 'accessToken', 'refreshToken', 'idToken', 'expiresAt', 'password', 'accessTokenExpiresAt', 'refreshTokenExpiresAt', 'scope', 'createdAt', 'updatedAt'])

export type AccountScalarFieldEnum = z.infer<typeof AccountScalarFieldEnumSchema>;

// File: VerificationScalarFieldEnum.schema.ts

export const VerificationScalarFieldEnumSchema = z.enum(['id', 'identifier', 'value', 'expiresAt', 'createdAt', 'updatedAt'])

export type VerificationScalarFieldEnum = z.infer<typeof VerificationScalarFieldEnumSchema>;

// File: PasskeyScalarFieldEnum.schema.ts

export const PasskeyScalarFieldEnumSchema = z.enum(['id', 'name', 'publicKey', 'userId', 'credentialID', 'counter', 'deviceType', 'backedUp', 'transports', 'aaguid', 'createdAt'])

export type PasskeyScalarFieldEnum = z.infer<typeof PasskeyScalarFieldEnumSchema>;

// File: TwoFactorScalarFieldEnum.schema.ts

export const TwoFactorScalarFieldEnumSchema = z.enum(['id', 'secret', 'backupCodes', 'userId'])

export type TwoFactorScalarFieldEnum = z.infer<typeof TwoFactorScalarFieldEnumSchema>;

// File: OrganizationScalarFieldEnum.schema.ts

export const OrganizationScalarFieldEnumSchema = z.enum(['id', 'name', 'slug', 'logo', 'createdAt', 'metadata', 'paymentsCustomerId'])

export type OrganizationScalarFieldEnum = z.infer<typeof OrganizationScalarFieldEnumSchema>;

// File: MemberScalarFieldEnum.schema.ts

export const MemberScalarFieldEnumSchema = z.enum(['id', 'organizationId', 'userId', 'role', 'createdAt', 'circleMemberId', 'circleProvisionedAt', 'circleStatus', 'circleRefreshToken', 'circleProfileConfirmedAt', 'circleAccessToken', 'circleAccessTokenExpiresAt', 'circleLastSeenNotificationId', 'circleLastPolledAt'])

export type MemberScalarFieldEnum = z.infer<typeof MemberScalarFieldEnumSchema>;

// File: InvitationScalarFieldEnum.schema.ts

export const InvitationScalarFieldEnumSchema = z.enum(['id', 'organizationId', 'email', 'role', 'status', 'expiresAt', 'inviterId', 'createdAt'])

export type InvitationScalarFieldEnum = z.infer<typeof InvitationScalarFieldEnumSchema>;

// File: PurchaseScalarFieldEnum.schema.ts

export const PurchaseScalarFieldEnumSchema = z.enum(['id', 'organizationId', 'userId', 'type', 'customerId', 'subscriptionId', 'priceId', 'status', 'createdAt', 'updatedAt'])

export type PurchaseScalarFieldEnum = z.infer<typeof PurchaseScalarFieldEnumSchema>;

// File: NotificationScalarFieldEnum.schema.ts

export const NotificationScalarFieldEnumSchema = z.enum(['id', 'userId', 'type', 'data', 'link', 'read', 'createdAt', 'updatedAt'])

export type NotificationScalarFieldEnum = z.infer<typeof NotificationScalarFieldEnumSchema>;

// File: UserNotificationPreferenceScalarFieldEnum.schema.ts

export const UserNotificationPreferenceScalarFieldEnumSchema = z.enum(['id', 'userId', 'type', 'target', 'createdAt'])

export type UserNotificationPreferenceScalarFieldEnum = z.infer<typeof UserNotificationPreferenceScalarFieldEnumSchema>;

// File: HorseScalarFieldEnum.schema.ts

export const HorseScalarFieldEnumSchema = z.enum(['id', 'organizationId', 'slug', 'name', 'providerEntityId', 'providerLastSync', 'status', 'bio', 'story', 'trainerNotes', 'photos', 'audioNotes', 'pedigree', 'ownershipBlurb', 'circleSpaceId', 'circleSpaceStatus', 'circleSpaceProvisionedAt', 'circleSpaceVisibility', 'trainerId', 'sortOrder', 'publishedAt', 'publicProfileAt', 'latestEntryId', 'nextEntryId', 'createdAt', 'updatedAt'])

export type HorseScalarFieldEnum = z.infer<typeof HorseScalarFieldEnumSchema>;

// File: HorseFollowScalarFieldEnum.schema.ts

export const HorseFollowScalarFieldEnumSchema = z.enum(['id', 'organizationId', 'userId', 'horseId', 'createdAt'])

export type HorseFollowScalarFieldEnum = z.infer<typeof HorseFollowScalarFieldEnumSchema>;

// File: TrainerScalarFieldEnum.schema.ts

export const TrainerScalarFieldEnumSchema = z.enum(['id', 'organizationId', 'providerEntityId', 'name', 'meta', 'createdAt', 'updatedAt'])

export type TrainerScalarFieldEnum = z.infer<typeof TrainerScalarFieldEnumSchema>;

// File: JockeyScalarFieldEnum.schema.ts

export const JockeyScalarFieldEnumSchema = z.enum(['id', 'organizationId', 'providerEntityId', 'name', 'meta', 'createdAt', 'updatedAt'])

export type JockeyScalarFieldEnum = z.infer<typeof JockeyScalarFieldEnumSchema>;

// File: CourseScalarFieldEnum.schema.ts

export const CourseScalarFieldEnumSchema = z.enum(['id', 'organizationId', 'providerEntityId', 'name', 'country', 'surface', 'createdAt'])

export type CourseScalarFieldEnum = z.infer<typeof CourseScalarFieldEnumSchema>;

// File: MeetingScalarFieldEnum.schema.ts

export const MeetingScalarFieldEnumSchema = z.enum(['id', 'organizationId', 'providerEntityId', 'courseId', 'date', 'createdAt', 'updatedAt'])

export type MeetingScalarFieldEnum = z.infer<typeof MeetingScalarFieldEnumSchema>;

// File: RaceScalarFieldEnum.schema.ts

export const RaceScalarFieldEnumSchema = z.enum(['id', 'organizationId', 'providerEntityId', 'meetingId', 'postTime', 'name', 'raceType', 'distanceFurlongs', 'className', 'prizeMoney', 'goingDescription', 'createdAt', 'updatedAt'])

export type RaceScalarFieldEnum = z.infer<typeof RaceScalarFieldEnumSchema>;

// File: RaceEntryScalarFieldEnum.schema.ts

export const RaceEntryScalarFieldEnumSchema = z.enum(['id', 'organizationId', 'providerEntityId', 'horseId', 'raceId', 'status', 'draw', 'weightLbs', 'jockeyId', 'trainerId', 'finishingPosition', 'beatenLengths', 'ratingAchieved', 'timeformComment', 'performanceRating', 'starRating', 'replayUrl', 'notifiedStates', 'createdAt', 'updatedAt'])

export type RaceEntryScalarFieldEnum = z.infer<typeof RaceEntryScalarFieldEnumSchema>;

// File: NewsPostScalarFieldEnum.schema.ts

export const NewsPostScalarFieldEnumSchema = z.enum(['id', 'organizationId', 'slug', 'title', 'subtitle', 'featuredImageUrl', 'contentJson', 'contentHtml', 'publishedAt', 'notifyMembersOnPublish', 'notificationSentAt', 'authorUserId', 'createdAt', 'updatedAt'])

export type NewsPostScalarFieldEnum = z.infer<typeof NewsPostScalarFieldEnumSchema>;

// File: MemberPostScalarFieldEnum.schema.ts

export const MemberPostScalarFieldEnumSchema = z.enum(['id', 'organizationId', 'authorUserId', 'audienceType', 'horseId', 'updateType', 'title', 'bodyJson', 'bodyHtml', 'videoUrl', 'status', 'circleSpaceId', 'circlePostId', 'publishedAt', 'publishError', 'createdAt', 'updatedAt'])

export type MemberPostScalarFieldEnum = z.infer<typeof MemberPostScalarFieldEnumSchema>;

// File: PushTokenScalarFieldEnum.schema.ts

export const PushTokenScalarFieldEnumSchema = z.enum(['id', 'userId', 'expoPushToken', 'deviceLabel', 'platform', 'lastSeenAt', 'createdAt'])

export type PushTokenScalarFieldEnum = z.infer<typeof PushTokenScalarFieldEnumSchema>;

// File: PushLogScalarFieldEnum.schema.ts

export const PushLogScalarFieldEnumSchema = z.enum(['id', 'organizationId', 'userId', 'expoPushToken', 'title', 'body', 'data', 'triggerType', 'triggerRefId', 'status', 'error', 'sentAt', 'createdAt'])

export type PushLogScalarFieldEnum = z.infer<typeof PushLogScalarFieldEnumSchema>;

// File: StripeEventLogScalarFieldEnum.schema.ts

export const StripeEventLogScalarFieldEnumSchema = z.enum(['id', 'type', 'processedAt'])

export type StripeEventLogScalarFieldEnum = z.infer<typeof StripeEventLogScalarFieldEnumSchema>;

// File: SortOrder.schema.ts

export const SortOrderSchema = z.enum(['asc', 'desc'])

export type SortOrder = z.infer<typeof SortOrderSchema>;

// File: JsonNullValueInput.schema.ts

export const JsonNullValueInputSchema = z.enum(['JsonNull'])

export type JsonNullValueInput = z.infer<typeof JsonNullValueInputSchema>;

// File: NullableJsonNullValueInput.schema.ts

export const NullableJsonNullValueInputSchema = z.enum(['DbNull', 'JsonNull'])

export type NullableJsonNullValueInput = z.infer<typeof NullableJsonNullValueInputSchema>;

// File: QueryMode.schema.ts

export const QueryModeSchema = z.enum(['default', 'insensitive'])

export type QueryMode = z.infer<typeof QueryModeSchema>;

// File: JsonNullValueFilter.schema.ts

export const JsonNullValueFilterSchema = z.enum(['DbNull', 'JsonNull', 'AnyNull'])

export type JsonNullValueFilter = z.infer<typeof JsonNullValueFilterSchema>;

// File: NullsOrder.schema.ts

export const NullsOrderSchema = z.enum(['first', 'last'])

export type NullsOrder = z.infer<typeof NullsOrderSchema>;

// File: PurchaseType.schema.ts

export const PurchaseTypeSchema = z.enum(['SUBSCRIPTION', 'ONE_TIME'])

export type PurchaseType = z.infer<typeof PurchaseTypeSchema>;

// File: NotificationType.schema.ts

export const NotificationTypeSchema = z.enum(['WELCOME', 'APP_UPDATE'])

export type NotificationType = z.infer<typeof NotificationTypeSchema>;

// File: NotificationTarget.schema.ts

export const NotificationTargetSchema = z.enum(['IN_APP', 'EMAIL'])

export type NotificationTarget = z.infer<typeof NotificationTargetSchema>;

// File: HorseStatus.schema.ts

export const HorseStatusSchema = z.enum(['PRE_TRAINING', 'IN_TRAINING', 'REHAB', 'RETIRED', 'SOLD'])

export type HorseStatus = z.infer<typeof HorseStatusSchema>;

// File: RaceEntryStatus.schema.ts

export const RaceEntryStatusSchema = z.enum(['ENTERED', 'DECLARED', 'NON_RUNNER', 'RAN', 'DISQUALIFIED', 'VOID'])

export type RaceEntryStatus = z.infer<typeof RaceEntryStatusSchema>;

// File: DevicePlatform.schema.ts

export const DevicePlatformSchema = z.enum(['IOS', 'ANDROID'])

export type DevicePlatform = z.infer<typeof DevicePlatformSchema>;

// File: PushTriggerType.schema.ts

export const PushTriggerTypeSchema = z.enum(['HORSE_DECLARED', 'HORSE_NON_RUNNER', 'RACE_RESULT', 'TRAINER_POST', 'NEWS_POST', 'SYSTEM', 'CIRCLE_MENTION', 'CIRCLE_REPLY', 'CIRCLE_REACTION', 'CIRCLE_DM', 'CIRCLE_HORSE_DISCUSSION', 'HORSE_WELLBEING'])

export type PushTriggerType = z.infer<typeof PushTriggerTypeSchema>;

// File: PushStatus.schema.ts

export const PushStatusSchema = z.enum(['QUEUED', 'SENT', 'FAILED'])

export type PushStatus = z.infer<typeof PushStatusSchema>;

// File: User.schema.ts

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  image: z.string().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
  username: z.string().nullish(),
  role: z.string().nullish(),
  banned: z.boolean().nullish(),
  banReason: z.string().nullish(),
  banExpires: z.date().nullish(),
  onboardingComplete: z.boolean(),
  paymentsCustomerId: z.string().nullish(),
  locale: z.string().nullish(),
  displayUsername: z.string().nullish(),
  twoFactorEnabled: z.boolean().nullish(),
  lastActiveOrganizationId: z.string().nullish(),
  pushEnabled: z.boolean().default(true),
  pushPreferences: z.unknown().refine((val) => { const getDepth = (obj: unknown, depth: number = 0): number => { if (depth > 10) return depth; if (obj === null || typeof obj !== 'object') return depth; const values = Object.values(obj as Record<string, unknown>); if (values.length === 0) return depth; return Math.max(...values.map(v => getDepth(v, depth + 1))); }; return getDepth(val) <= 10; }, "JSON nesting depth exceeds maximum of 10").default("{}"),
  emailPreferences: z.unknown().refine((val) => { const getDepth = (obj: unknown, depth: number = 0): number => { if (depth > 10) return depth; if (obj === null || typeof obj !== 'object') return depth; const values = Object.values(obj as Record<string, unknown>); if (values.length === 0) return depth; return Math.max(...values.map(v => getDepth(v, depth + 1))); }; return getDepth(val) <= 10; }, "JSON nesting depth exceeds maximum of 10").default("{}"),
});

export type UserType = z.infer<typeof UserSchema>;


// File: Session.schema.ts

export const SessionSchema = z.object({
  id: z.string(),
  expiresAt: z.date(),
  ipAddress: z.string().nullish(),
  userAgent: z.string().nullish(),
  userId: z.string(),
  impersonatedBy: z.string().nullish(),
  activeOrganizationId: z.string().nullish(),
  token: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type SessionType = z.infer<typeof SessionSchema>;


// File: Account.schema.ts

export const AccountSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  providerId: z.string(),
  userId: z.string(),
  accessToken: z.string().nullish(),
  refreshToken: z.string().nullish(),
  idToken: z.string().nullish(),
  expiresAt: z.date().nullish(),
  password: z.string().nullish(),
  accessTokenExpiresAt: z.date().nullish(),
  refreshTokenExpiresAt: z.date().nullish(),
  scope: z.string().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type AccountType = z.infer<typeof AccountSchema>;


// File: Verification.schema.ts

export const VerificationSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  value: z.string(),
  expiresAt: z.date(),
  createdAt: z.date().nullish(),
  updatedAt: z.date().nullish(),
});

export type VerificationType = z.infer<typeof VerificationSchema>;


// File: Passkey.schema.ts

export const PasskeySchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  publicKey: z.string(),
  userId: z.string(),
  credentialID: z.string(),
  counter: z.number().int(),
  deviceType: z.string(),
  backedUp: z.boolean(),
  transports: z.string().nullish(),
  aaguid: z.string().nullish(),
  createdAt: z.date().nullish(),
});

export type PasskeyType = z.infer<typeof PasskeySchema>;


// File: TwoFactor.schema.ts

export const TwoFactorSchema = z.object({
  id: z.string(),
  secret: z.string(),
  backupCodes: z.string(),
  userId: z.string(),
});

export type TwoFactorType = z.infer<typeof TwoFactorSchema>;


// File: Organization.schema.ts

export const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullish(),
  logo: z.string().nullish(),
  createdAt: z.date(),
  metadata: z.string().nullish(),
  paymentsCustomerId: z.string().nullish(),
});

export type OrganizationType = z.infer<typeof OrganizationSchema>;


// File: Member.schema.ts

export const MemberSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  userId: z.string(),
  role: z.string(),
  createdAt: z.date(),
  circleMemberId: z.string().nullish(),
  circleProvisionedAt: z.date().nullish(),
  circleStatus: z.string().nullish(),
  circleRefreshToken: z.string().nullish(),
  circleProfileConfirmedAt: z.date().nullish(),
  circleAccessToken: z.string().nullish(),
  circleAccessTokenExpiresAt: z.date().nullish(),
  circleLastSeenNotificationId: z.string().nullish(),
  circleLastPolledAt: z.date().nullish(),
});

export type MemberType = z.infer<typeof MemberSchema>;


// File: Invitation.schema.ts

export const InvitationSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  email: z.string(),
  role: z.string().nullish(),
  status: z.string(),
  expiresAt: z.date(),
  inviterId: z.string(),
  createdAt: z.date(),
});

export type InvitationType = z.infer<typeof InvitationSchema>;


// File: Purchase.schema.ts

export const PurchaseSchema = z.object({
  id: z.string(),
  organizationId: z.string().nullish(),
  userId: z.string().nullish(),
  type: PurchaseTypeSchema,
  customerId: z.string(),
  subscriptionId: z.string().nullish(),
  priceId: z.string(),
  status: z.string().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type PurchaseModel = z.infer<typeof PurchaseSchema>;

// File: Notification.schema.ts

export const NotificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: NotificationTypeSchema,
  data: z.unknown().refine((val) => { const getDepth = (obj: unknown, depth: number = 0): number => { if (depth > 10) return depth; if (obj === null || typeof obj !== 'object') return depth; const values = Object.values(obj as Record<string, unknown>); if (values.length === 0) return depth; return Math.max(...values.map(v => getDepth(v, depth + 1))); }; return getDepth(val) <= 10; }, "JSON nesting depth exceeds maximum of 10").default("{}"),
  link: z.string().nullish(),
  read: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type NotificationModel = z.infer<typeof NotificationSchema>;

// File: UserNotificationPreference.schema.ts

export const UserNotificationPreferenceSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: NotificationTypeSchema,
  target: NotificationTargetSchema,
  createdAt: z.date(),
});

export type UserNotificationPreferenceType = z.infer<typeof UserNotificationPreferenceSchema>;


// File: Horse.schema.ts

export const HorseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  slug: z.string(),
  name: z.string(),
  providerEntityId: z.string().nullish(),
  providerLastSync: z.date().nullish(),
  status: HorseStatusSchema.default("IN_TRAINING"),
  bio: z.string().nullish(),
  story: z.string().nullish(),
  trainerNotes: z.string().nullish(),
  photos: z.unknown().refine((val) => { const getDepth = (obj: unknown, depth: number = 0): number => { if (depth > 10) return depth; if (obj === null || typeof obj !== 'object') return depth; const values = Object.values(obj as Record<string, unknown>); if (values.length === 0) return depth; return Math.max(...values.map(v => getDepth(v, depth + 1))); }; return getDepth(val) <= 10; }, "JSON nesting depth exceeds maximum of 10").default("[]"),
  audioNotes: z.unknown().refine((val) => { const getDepth = (obj: unknown, depth: number = 0): number => { if (depth > 10) return depth; if (obj === null || typeof obj !== 'object') return depth; const values = Object.values(obj as Record<string, unknown>); if (values.length === 0) return depth; return Math.max(...values.map(v => getDepth(v, depth + 1))); }; return getDepth(val) <= 10; }, "JSON nesting depth exceeds maximum of 10").default("[]"),
  pedigree: z.unknown().refine((val) => { const getDepth = (obj: unknown, depth: number = 0): number => { if (depth > 10) return depth; if (obj === null || typeof obj !== 'object') return depth; const values = Object.values(obj as Record<string, unknown>); if (values.length === 0) return depth; return Math.max(...values.map(v => getDepth(v, depth + 1))); }; return getDepth(val) <= 10; }, "JSON nesting depth exceeds maximum of 10").nullish(),
  ownershipBlurb: z.string().nullish(),
  circleSpaceId: z.string().nullish(),
  circleSpaceStatus: z.string().nullish(),
  circleSpaceProvisionedAt: z.date().nullish(),
  circleSpaceVisibility: z.string().default("private").nullish(),
  trainerId: z.string().nullish(),
  sortOrder: z.number().int(),
  publishedAt: z.date().nullish(),
  publicProfileAt: z.date().nullish(),
  latestEntryId: z.string().nullish(),
  nextEntryId: z.string().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type HorseType = z.infer<typeof HorseSchema>;


// File: HorseFollow.schema.ts

export const HorseFollowSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  userId: z.string(),
  horseId: z.string(),
  createdAt: z.date(),
});

export type HorseFollowType = z.infer<typeof HorseFollowSchema>;


// File: Trainer.schema.ts

export const TrainerSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  providerEntityId: z.string().nullish(),
  name: z.string(),
  meta: z.unknown().refine((val) => { const getDepth = (obj: unknown, depth: number = 0): number => { if (depth > 10) return depth; if (obj === null || typeof obj !== 'object') return depth; const values = Object.values(obj as Record<string, unknown>); if (values.length === 0) return depth; return Math.max(...values.map(v => getDepth(v, depth + 1))); }; return getDepth(val) <= 10; }, "JSON nesting depth exceeds maximum of 10").nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TrainerType = z.infer<typeof TrainerSchema>;


// File: Jockey.schema.ts

export const JockeySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  providerEntityId: z.string().nullish(),
  name: z.string(),
  meta: z.unknown().refine((val) => { const getDepth = (obj: unknown, depth: number = 0): number => { if (depth > 10) return depth; if (obj === null || typeof obj !== 'object') return depth; const values = Object.values(obj as Record<string, unknown>); if (values.length === 0) return depth; return Math.max(...values.map(v => getDepth(v, depth + 1))); }; return getDepth(val) <= 10; }, "JSON nesting depth exceeds maximum of 10").nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type JockeyType = z.infer<typeof JockeySchema>;


// File: Course.schema.ts

export const CourseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  providerEntityId: z.string().nullish(),
  name: z.string(),
  country: z.string().nullish(),
  surface: z.string().nullish(),
  createdAt: z.date(),
});

export type CourseType = z.infer<typeof CourseSchema>;


// File: Meeting.schema.ts

export const MeetingSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  providerEntityId: z.string().nullish(),
  courseId: z.string(),
  date: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type MeetingType = z.infer<typeof MeetingSchema>;


// File: Race.schema.ts

export const RaceSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  providerEntityId: z.string().nullish(),
  meetingId: z.string(),
  postTime: z.date(),
  name: z.string().nullish(),
  raceType: z.string().nullish(),
  distanceFurlongs: z.number().int().nullish(),
  className: z.string().nullish(),
  prizeMoney: z.number().int().nullish(),
  goingDescription: z.string().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type RaceType = z.infer<typeof RaceSchema>;


// File: RaceEntry.schema.ts

export const RaceEntrySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  providerEntityId: z.string().nullish(),
  horseId: z.string(),
  raceId: z.string(),
  status: RaceEntryStatusSchema,
  draw: z.number().int().nullish(),
  weightLbs: z.number().int().nullish(),
  jockeyId: z.string().nullish(),
  trainerId: z.string().nullish(),
  finishingPosition: z.number().int().nullish(),
  beatenLengths: z.instanceof(Prisma.Decimal, {
  message: "Field 'beatenLengths' must be a Decimal. Location: ['Models', 'RaceEntry']",
}).nullish(),
  ratingAchieved: z.number().int().nullish(),
  timeformComment: z.string().nullish(),
  performanceRating: z.number().int().nullish(),
  starRating: z.number().int().nullish(),
  replayUrl: z.string().nullish(),
  notifiedStates: z.unknown().refine((val) => { const getDepth = (obj: unknown, depth: number = 0): number => { if (depth > 10) return depth; if (obj === null || typeof obj !== 'object') return depth; const values = Object.values(obj as Record<string, unknown>); if (values.length === 0) return depth; return Math.max(...values.map(v => getDepth(v, depth + 1))); }; return getDepth(val) <= 10; }, "JSON nesting depth exceeds maximum of 10").default("[]"),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type RaceEntryType = z.infer<typeof RaceEntrySchema>;


// File: NewsPost.schema.ts

export const NewsPostSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().nullish(),
  featuredImageUrl: z.string().nullish(),
  contentJson: z.unknown().refine((val) => { const getDepth = (obj: unknown, depth: number = 0): number => { if (depth > 10) return depth; if (obj === null || typeof obj !== 'object') return depth; const values = Object.values(obj as Record<string, unknown>); if (values.length === 0) return depth; return Math.max(...values.map(v => getDepth(v, depth + 1))); }; return getDepth(val) <= 10; }, "JSON nesting depth exceeds maximum of 10"),
  contentHtml: z.string(),
  publishedAt: z.date().nullish(),
  notifyMembersOnPublish: z.boolean(),
  notificationSentAt: z.date().nullish(),
  authorUserId: z.string().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type NewsPostType = z.infer<typeof NewsPostSchema>;


// File: MemberPost.schema.ts

export const MemberPostSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  authorUserId: z.string().nullish(),
  audienceType: z.string(),
  horseId: z.string().nullish(),
  updateType: z.string().nullish(),
  title: z.string(),
  bodyJson: z.unknown().refine((val) => { const getDepth = (obj: unknown, depth: number = 0): number => { if (depth > 10) return depth; if (obj === null || typeof obj !== 'object') return depth; const values = Object.values(obj as Record<string, unknown>); if (values.length === 0) return depth; return Math.max(...values.map(v => getDepth(v, depth + 1))); }; return getDepth(val) <= 10; }, "JSON nesting depth exceeds maximum of 10").default("{}"),
  bodyHtml: z.string().nullish(),
  videoUrl: z.string().nullish(),
  status: z.string().default("draft"),
  circleSpaceId: z.string().nullish(),
  circlePostId: z.string().nullish(),
  publishedAt: z.date().nullish(),
  publishError: z.string().nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type MemberPostType = z.infer<typeof MemberPostSchema>;


// File: PushToken.schema.ts

export const PushTokenSchema = z.object({
  id: z.string(),
  userId: z.string(),
  expoPushToken: z.string(),
  deviceLabel: z.string().nullish(),
  platform: DevicePlatformSchema,
  lastSeenAt: z.date(),
  createdAt: z.date(),
});

export type PushTokenType = z.infer<typeof PushTokenSchema>;


// File: PushLog.schema.ts

export const PushLogSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  userId: z.string().nullish(),
  expoPushToken: z.string().nullish(),
  title: z.string(),
  body: z.string(),
  data: z.unknown().refine((val) => { const getDepth = (obj: unknown, depth: number = 0): number => { if (depth > 10) return depth; if (obj === null || typeof obj !== 'object') return depth; const values = Object.values(obj as Record<string, unknown>); if (values.length === 0) return depth; return Math.max(...values.map(v => getDepth(v, depth + 1))); }; return getDepth(val) <= 10; }, "JSON nesting depth exceeds maximum of 10").nullish(),
  triggerType: PushTriggerTypeSchema,
  triggerRefId: z.string().nullish(),
  status: PushStatusSchema.default("QUEUED"),
  error: z.string().nullish(),
  sentAt: z.date().nullish(),
  createdAt: z.date(),
});

export type PushLogType = z.infer<typeof PushLogSchema>;


// File: StripeEventLog.schema.ts

export const StripeEventLogSchema = z.object({
  id: z.string(),
  type: z.string(),
  processedAt: z.date(),
});

export type StripeEventLogType = z.infer<typeof StripeEventLogSchema>;

