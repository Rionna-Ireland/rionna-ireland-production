import { SmartCoercionPlugin } from "@orpc/json-schema";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { describe, expect, it } from "vitest";

import { buildOpenApiPlugins } from "./openapi-plugins";

const options = {
	specGenerateOptions: async () => ({}),
};

describe("buildOpenApiPlugins", () => {
	it("always includes the SmartCoercionPlugin", () => {
		for (const nodeEnv of ["production", "development", undefined]) {
			const plugins = buildOpenApiPlugins(nodeEnv, options);
			expect(
				plugins.some((plugin) => plugin instanceof SmartCoercionPlugin),
			).toBe(true);
		}
	});

	it("omits the OpenAPIReferencePlugin in production", () => {
		const plugins = buildOpenApiPlugins("production", options);
		expect(
			plugins.some((plugin) => plugin instanceof OpenAPIReferencePlugin),
		).toBe(false);
	});

	it("includes the OpenAPIReferencePlugin in development", () => {
		const plugins = buildOpenApiPlugins("development", options);
		expect(
			plugins.some((plugin) => plugin instanceof OpenAPIReferencePlugin),
		).toBe(true);
	});

	it("includes the OpenAPIReferencePlugin when NODE_ENV is undefined", () => {
		const plugins = buildOpenApiPlugins(undefined, options);
		expect(
			plugins.some((plugin) => plugin instanceof OpenAPIReferencePlugin),
		).toBe(true);
	});
});
