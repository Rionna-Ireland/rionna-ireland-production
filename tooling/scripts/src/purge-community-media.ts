/**
 * One-off cleanup (S15-01): delete the legacy member post images under
 * `community/` in the private `media` bucket. Members only ever see Circle's
 * copy, and no DB row stores these keys (CommunityPost only has `hasImage`).
 *
 *   pnpm --filter @repo/scripts purge:community-media:staging           # dry run
 *   pnpm --filter @repo/scripts purge:community-media:staging -- --apply
 *
 * Uses the S3_* env of whichever env file is loaded (staging first, then prod).
 */
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

const PREFIX = "community/";
const BUCKET = process.env.NEXT_PUBLIC_MEDIA_BUCKET_NAME ?? "media";
const apply = process.argv.includes("--apply");

const s3 = new S3Client({
	region: process.env.S3_REGION || "auto",
	endpoint: process.env.S3_ENDPOINT,
	forcePathStyle: true,
	credentials: {
		accessKeyId: process.env.S3_ACCESS_KEY_ID as string,
		secretAccessKey: process.env.S3_SECRET_ACCESS_KEY as string,
	},
});

async function main() {
	if (!(process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY)) {
		throw new Error("Missing S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY");
	}
	console.log(`${apply ? "APPLY" : "DRY RUN"}: s3://${BUCKET}/${PREFIX} @ ${process.env.S3_ENDPOINT}`);

	let count = 0;
	let bytes = 0;
	let token: string | undefined;
	do {
		const page = await s3.send(
			new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX, ContinuationToken: token }),
		);
		const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [o.Key] : []));
		count += keys.length;
		bytes += (page.Contents ?? []).reduce((n, o) => n + (o.Size ?? 0), 0);
		// Delete page-by-page (<=1000 keys, the DeleteObjects max); continuation stays valid.
		if (apply && keys.length > 0) {
			const res = await s3.send(
				new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }),
			);
			if (res.Errors?.length) throw new Error(`Delete errors: ${JSON.stringify(res.Errors.slice(0, 3))}`);
		}
		token = page.NextContinuationToken;
	} while (token);

	console.log(`${apply ? "Deleted" : "Would delete"} ${count} objects, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
