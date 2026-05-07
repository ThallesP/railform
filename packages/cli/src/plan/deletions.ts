import type {
	Project,
	RailwayConfigPatch,
	RailwayPatchValue,
	RailwayVariablePromptRequest,
} from "@railform/core";
import type { RailwayProject } from "../railway/project";
import type { ReconciledRailwayConfig } from "../railway/reconcile";

const railformDeployKeys = new Set([
	"buildCommand",
	"healthcheckPath",
	"healthcheckTimeout",
	"numReplicas",
	"region",
	"rootDirectory",
	"startCommand",
]);

export function addDeletedConfigValues(options: {
	patch: RailwayConfigPatch;
	baseConfig: RailwayConfigPatch | undefined;
	project: RailwayProject;
	config: Project;
	reconcileResult: ReconciledRailwayConfig;
	promptVariableRequests?: RailwayVariablePromptRequest[];
}): RailwayConfigPatch {
	const patch = clonePatch(options.patch);
	const baseConfig = options.baseConfig ?? {};

	addSharedVariableDeletes(
		patch,
		baseConfig,
		getSharedPromptVariableNames(options.promptVariableRequests ?? []),
	);
	addServiceConfigDeletes({
		patch,
		baseConfig,
		project: options.project,
		config: options.config,
		reconcileResult: options.reconcileResult,
		promptVariableRequests: options.promptVariableRequests ?? [],
	});

	return removeEmptyRecords(patch);
}

function addSharedVariableDeletes(
	patch: RailwayConfigPatch,
	baseConfig: RailwayConfigPatch,
	promptVariableNames: Set<string>,
): void {
	const baseVariables = getRecord(baseConfig.sharedVariables);

	if (!baseVariables) {
		return;
	}

	const desiredVariables = getRecord(patch.sharedVariables);

	for (const name of Object.keys(baseVariables)) {
		if (promptVariableNames.has(name)) {
			continue;
		}

		if (desiredVariables?.[name] !== undefined) {
			continue;
		}

		ensureRecord(patch, "sharedVariables")[name] = null;
	}
}

function addServiceConfigDeletes(options: {
	patch: RailwayConfigPatch;
	baseConfig: RailwayConfigPatch;
	project: RailwayProject;
	config: Project;
	reconcileResult: ReconciledRailwayConfig;
	promptVariableRequests: RailwayVariablePromptRequest[];
}): void {
	const baseServices = getRecord(options.baseConfig.services);

	if (!baseServices) {
		return;
	}

	const deletedServiceIds = new Set([
		...options.reconcileResult.deletedServices.map((service) => service.id),
		...options.reconcileResult.deletedDatabases.map((database) => database.id),
	]);
	const createdServiceNames = new Set(options.reconcileResult.createdServices);

	for (const serviceConfig of options.config.services) {
		if (createdServiceNames.has(serviceConfig.name)) {
			continue;
		}

		const service = options.project.services.find((item) => {
			return item.name === serviceConfig.name;
		});

		if (!service || deletedServiceIds.has(service.id)) {
			continue;
		}

		const baseServiceConfig = getRecord(baseServices[service.id]);

		if (!baseServiceConfig) {
			continue;
		}

		const servicePatch = ensureRecord(
			ensureRecord(options.patch, "services"),
			service.id,
		);

		addNestedDeletes(
			servicePatch,
			baseServiceConfig,
			"variables",
			undefined,
			getServicePromptVariableNames(
				options.promptVariableRequests,
				serviceConfig.name,
			),
		);
		addNestedDeletes(
			servicePatch,
			baseServiceConfig,
			"deploy",
			railformDeployKeys,
		);
	}
}

function addNestedDeletes(
	patch: RailwayConfigPatch,
	baseConfig: Record<string, RailwayPatchValue>,
	key: string,
	allowedKeys?: Set<string>,
	preserveKeys?: Set<string>,
): void {
	const baseValues = getRecord(baseConfig[key]);

	if (!baseValues) {
		return;
	}

	const desiredValues = getRecord(patch[key]);

	for (const name of Object.keys(baseValues)) {
		if (allowedKeys && !allowedKeys.has(name)) {
			continue;
		}

		if (preserveKeys?.has(name)) {
			continue;
		}

		if (desiredValues?.[name] !== undefined) {
			continue;
		}

		ensureRecord(patch, key)[name] = null;
	}
}

function clonePatch(patch: RailwayConfigPatch): RailwayConfigPatch {
	return JSON.parse(JSON.stringify(patch)) as RailwayConfigPatch;
}

function ensureRecord(
	parent: RailwayConfigPatch,
	key: string,
): RailwayConfigPatch {
	const existing = getRecord(parent[key]);

	if (existing) {
		return existing;
	}

	const record: RailwayConfigPatch = {};
	parent[key] = record;
	return record;
}

function getSharedPromptVariableNames(
	requests: RailwayVariablePromptRequest[],
): Set<string> {
	return new Set(
		requests
			.filter((request) => request.scope === "shared")
			.map((request) => request.name),
	);
}

function getServicePromptVariableNames(
	requests: RailwayVariablePromptRequest[],
	serviceName: string,
): Set<string> {
	return new Set(
		requests
			.filter(
				(request) =>
					request.scope === "service" && request.serviceName === serviceName,
			)
			.map((request) => request.name),
	);
}

function removeEmptyRecords(patch: RailwayConfigPatch): RailwayConfigPatch {
	for (const [key, value] of Object.entries(patch)) {
		const record = getRecord(value);

		if (!record) {
			continue;
		}

		removeEmptyRecords(record);

		if (Object.keys(record).length === 0) {
			delete patch[key];
		}
	}

	return patch;
}

function getRecord(
	value: RailwayPatchValue | undefined,
): RailwayConfigPatch | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}

	if (Array.isArray(value)) {
		return undefined;
	}

	if (typeof value !== "object") {
		return undefined;
	}

	return value;
}
