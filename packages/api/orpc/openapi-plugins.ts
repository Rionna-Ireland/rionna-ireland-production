import { SmartCoercionPlugin } from "@orpc/json-schema";
import {
	OpenAPIReferencePlugin,
	type OpenAPIReferencePluginOptions,
} from "@orpc/openapi/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import type { Context } from "@orpc/server";
import type { StandardHandlerPlugin } from "@orpc/server/standard";

interface BuildOpenApiPluginsOptions {
	/**
	 * Spec generator passed straight through to the OpenAPIReferencePlugin.
	 * Accepted as an argument so this module stays free of the router/auth
	 * imports and can be unit-tested in isolation.
	 */
	specGenerateOptions: OpenAPIReferencePluginOptions<Context>["specGenerateOptions"];
}

/**
 * Builds the plugin list for the OpenAPI handler.
 *
 * The SmartCoercionPlugin is always included because it coerces the real REST
 * API request/response payloads. The OpenAPIReferencePlugin only serves the
 * interactive docs + the full merged OpenAPI schema, so it is excluded in
 * production to avoid disclosing internal endpoint shapes.
 */
export function buildOpenApiPlugins(
	nodeEnv: string | undefined,
	options: BuildOpenApiPluginsOptions,
): StandardHandlerPlugin<Context>[] {
	const plugins: StandardHandlerPlugin<Context>[] = [
		new SmartCoercionPlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
		}),
	];

	if (nodeEnv !== "production") {
		plugins.push(
			new OpenAPIReferencePlugin({
				schemaConverters: [new ZodToJsonSchemaConverter()],
				specGenerateOptions: options.specGenerateOptions,
				docsPath: "/docs",
			}),
		);
	}

	return plugins;
}
