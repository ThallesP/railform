import type { StandardSchemaV1 } from "@bunli/core";

export const booleanFlagSchema = {
	type: "boolean",
	"~standard": {
		version: 1,
		vendor: "railform",
		validate(value: unknown) {
			if (value === undefined) {
				return { value: false };
			}

			if (typeof value === "boolean") {
				return { value };
			}

			return {
				issues: [{ message: "Expected a boolean value" }],
			};
		},
	},
} as StandardSchemaV1<unknown, boolean>;

export const optionalStringSchema = {
	type: "string",
	"~standard": {
		version: 1,
		vendor: "railform",
		validate(value: unknown) {
			if (value === undefined) {
				return { value: undefined };
			}

			if (typeof value === "string") {
				return { value };
			}

			return {
				issues: [{ message: "Expected a string value" }],
			};
		},
	},
} as StandardSchemaV1<unknown, string | undefined>;

export const repeatableStringSchema = {
	type: "array",
	"~standard": {
		version: 1,
		vendor: "railform",
		validate(value: unknown) {
			if (value === undefined) {
				return { value: [] };
			}

			if (
				Array.isArray(value) &&
				value.every((item) => typeof item === "string")
			) {
				return { value };
			}

			return {
				issues: [{ message: "Expected string values" }],
			};
		},
	},
} as StandardSchemaV1<unknown, string[]>;
