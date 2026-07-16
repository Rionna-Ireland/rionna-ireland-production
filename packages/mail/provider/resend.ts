import { Resend } from "resend";

import { config } from "../config";
import type { SendEmailBatchHandler, SendEmailHandler } from "../types";

const resend = new Resend(process.env.RESEND_API_KEY);

/** Resend's hard cap on messages per batch call. */
export const MAX_BATCH_SIZE = 100;

/**
 * Send up to MAX_BATCH_SIZE fully rendered emails in one provider call
 * (FABLE_AUDIT P1). Unlike `send`, this surfaces the provider's error-return
 * as a throw so callers can count the chunk as failed — the Resend SDK
 * reports failures via `{ error }` rather than throwing.
 */
export const sendRawEmailBatch: SendEmailBatchHandler = async (messages) => {
	if (messages.length === 0) {
		return;
	}
	if (messages.length > MAX_BATCH_SIZE) {
		throw new Error(
			`Batch of ${messages.length} exceeds the Resend limit of ${MAX_BATCH_SIZE}`,
		);
	}
	const { error } = await resend.batch.send(
		messages.map((message) => ({
			from: message.from ?? config.mailFrom,
			to: [message.to],
			subject: message.subject,
			html: message.html ?? "",
			text: message.text,
		})),
	);
	if (error) {
		throw new Error(`Resend batch send failed: ${error.message}`);
	}
};

export const send: SendEmailHandler = async ({
	to,
	from,
	subject,
	cc,
	bcc,
	replyTo,
	html,
	text,
}) => {
	await resend.emails.send({
		from: from ?? config.mailFrom,
		to: [to],
		cc,
		bcc,
		replyTo,
		subject,
		html,
		text,
	});
};
