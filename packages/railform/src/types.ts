export type RailwayPatchValue =
	| string
	| number
	| boolean
	| null
	| RailwayPatchValue[]
	| { [key: string]: RailwayPatchValue };

export type RailwayConfigPatch = Record<string, RailwayPatchValue>;

export type RailwayVariableLiteral = string | number | boolean;

export type RailwayPromptVariable = {
	source: "prompt";
	message?: string;
	defaultValue?: string;
	secret?: boolean;
	required?: boolean;
};

export type RailwayPromptVariableOptions = Omit<
	RailwayPromptVariable,
	"source"
>;

export type RailwayVariableValue =
	| RailwayVariableLiteral
	| RailwayPromptVariable;

export type RailwayVariables = Record<string, RailwayVariableValue>;

export type ResolvedRailwayVariables = Record<string, RailwayVariableLiteral>;

export type RailwayVariablePatch = Record<string, { value: string }>;

export type RailwayServiceRef = {
	id: string;
	name: string;
};

export type RailwayDatabaseRef = {
	id: string;
	name: string;
	type: string;
};

export type RailwayPatchContext = {
	services: RailwayServiceRef[];
	databases?: RailwayDatabaseRef[];
};

export type RailwayVariablePromptRequest = {
	name: string;
	scope: "shared" | "service";
	serviceName?: string;
	prompt: RailwayPromptVariable;
};

export type RailwayVariableResolver = (
	request: RailwayVariablePromptRequest,
) => Promise<RailwayVariableLiteral | undefined>;

export function railwayRef(serviceName: string, variableName: string): string {
	return `\${{${serviceName}.${variableName}}}`;
}

export function railwayPublicDomain(serviceName: string): string {
	return railwayRef(serviceName, "RAILWAY_PUBLIC_DOMAIN");
}

export function railwayPrivateDomain(serviceName: string): string {
	return railwayRef(serviceName, "RAILWAY_PRIVATE_DOMAIN");
}

export function railwayPublicUrl(serviceName: string): string {
	return `https://${railwayPublicDomain(serviceName)}`;
}

export function railwayPrivateUrl(serviceName: string): string {
	return `https://${railwayPrivateDomain(serviceName)}`;
}

export function randomSecret(length: number, charset?: string): string {
	if (!Number.isInteger(length) || length <= 0) {
		throw new Error("randomSecret length must be a positive integer.");
	}

	if (charset !== undefined && charset.length === 0) {
		throw new Error("randomSecret charset must not be empty.");
	}

	if (charset === undefined) {
		return `\${{secret(${length})}}`;
	}

	return `\${{secret(${length}, ${JSON.stringify(charset)})}}`;
}

export function promptVariable(
	options: string | RailwayPromptVariableOptions = {},
): RailwayPromptVariable {
	if (typeof options === "string") {
		return {
			source: "prompt",
			message: options,
			secret: true,
			required: true,
		};
	}

	return {
		source: "prompt",
		secret: true,
		required: true,
		...options,
	};
}

export function formatVariables(
	variables: RailwayVariables,
): RailwayVariablePatch {
	const patch: RailwayVariablePatch = {};

	for (const [name, value] of Object.entries(variables)) {
		if (isPromptVariable(value)) {
			throw new Error(
				`Variable "${name}" must be resolved before creating a Railway patch.`,
			);
		}

		patch[name] = { value: String(value) };
	}

	return patch;
}

export function isPromptVariable(
	value: RailwayVariableValue,
): value is RailwayPromptVariable {
	if (value === null) {
		return false;
	}

	if (Array.isArray(value)) {
		return false;
	}

	if (typeof value !== "object") {
		return false;
	}

	return value.source === "prompt";
}
