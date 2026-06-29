import { onError } from "@orpc/client";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { RPCHandler } from "@orpc/server/fetch";
import { auth } from "@repo/auth";
import { logger } from "@repo/logs";

import { buildOpenApiPlugins } from "./openapi-plugins";
import { router } from "./router";

export const rpcHandler = new RPCHandler(router, {
	clientInterceptors: [
		onError((error) => {
			logger.error(error);
		}),
	],
});

export const openApiHandler = new OpenAPIHandler(router, {
	plugins: buildOpenApiPlugins(process.env.NODE_ENV, {
		specGenerateOptions: async () => {
			const authSchema = await auth.api.generateOpenAPISchema();

			authSchema.paths = Object.fromEntries(
				Object.entries(authSchema.paths).map(([path, pathItem]) => [
					`/auth${path}`,
					pathItem,
				]),
			);

			return {
				...(authSchema as any),
				info: {
					title: "supastarter API",
					version: "1.0.0",
				},
				servers: [
					{
						url: "/api",
					},
				],
			};
		},
	}),
	clientInterceptors: [
		onError((error) => {
			logger.error(error);
		}),
	],
});
