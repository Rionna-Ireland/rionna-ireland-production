export interface StorageBucketNamesConfig {
	/**
	 * Bucket used for user and organization avatar uploads.
	 */
	avatars: string;
	/**
	 * Private bucket for member-authored draft media (member-post / announcement
	 * composer images), served via the signed-URL image proxy.
	 */
	media: string;
	/**
	 * Public bucket for marketing-visible images (horse photos, news featured
	 * images, brand/logo assets). Served by public Supabase object URL — renders
	 * in both the saas and the public marketing app with no proxy or creds.
	 */
	mediaPublic: string;
}

export interface StorageConfig {
	/**
	 * Logical storage bucket names used throughout the application.
	 */
	bucketNames: StorageBucketNamesConfig;
}

export type CreateBucketHandler = (
	name: string,
	options?: {
		public?: boolean;
	},
) => Promise<void>;

export type GetSignedUploadUrlHandler = (
	path: string,
	options: {
		bucket: keyof StorageBucketNamesConfig;
	},
) => Promise<string>;

export type GetSignedUrlHander = (
	path: string,
	options: {
		bucket: keyof StorageBucketNamesConfig;
		expiresIn?: number;
	},
) => Promise<string>;
