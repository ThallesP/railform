import {
	cancel,
	confirm,
	isCancel,
	multiselect,
	password,
	text,
} from "@clack/prompts";
import type {
	Project,
	RailwayConfigPatch,
	RailwayPatchValue,
	RailwayVariableLiteral,
	RailwayVariablePromptRequest,
} from "@railform/core";
import type { ResourceChange } from "./plan/render";
import type { RailwayService } from "./railway/project";

export type ResolvePromptVariableOptions = {
	environmentConfig: RailwayConfigPatch;
	services: RailwayService[];
	values?: PromptVariableValues;
};

export type PromptVariableValues = Record<string, string>;

export async function resolvePromptVariables(
	project: Project,
	options: ResolvePromptVariableOptions,
): Promise<Project> {
	const requests = project.getVariablePromptRequests();
	const variablesToPrompt = getMissingVariableKeys(requests, options);

	return project.resolveVariables((request) => {
		const key = getRequestKey(request);
		const providedValue = options.values?.[key];

		if (providedValue !== undefined) {
			return Promise.resolve(providedValue);
		}

		if (!variablesToPrompt.has(key)) {
			return Promise.resolve(undefined);
		}

		assertCanPromptForVariable(request);

		return promptForVariable(request);
	});
}

export async function resolveChangedPromptVariables(
	project: Project,
	options: ResolvePromptVariableOptions,
): Promise<Project | undefined> {
	const requests = project
		.getVariablePromptRequests()
		.filter((request) => railwayVariableExists(request, options));

	if (requests.length === 0) {
		return undefined;
	}

	const shouldChange = await confirm({
		message: "Change any existing env variable values?",
		initialValue: false,
	});

	if (isCancel(shouldChange)) {
		cancel("Cancelled");
		throw new Error("Prompt cancelled");
	}

	if (!shouldChange) {
		return undefined;
	}

	const selected = await multiselect({
		message: "Select env variables to change",
		options: requests.map((request) => ({
			value: getRequestKey(request),
			label: getRequestLabel(request),
		})),
		required: false,
	});

	if (isCancel(selected)) {
		cancel("Cancelled");
		throw new Error("Prompt cancelled");
	}

	const variablesToPrompt = new Set(selected);

	if (variablesToPrompt.size === 0) {
		return undefined;
	}

	return project.resolveVariables((request) => {
		const key = getRequestKey(request);

		if (!variablesToPrompt.has(key)) {
			return Promise.resolve(undefined);
		}

		return promptForVariable(request);
	});
}

export async function resolvePreviewVariables(
	project: Project,
	options?: ResolvePromptVariableOptions,
): Promise<Project> {
	const requests = project.getVariablePromptRequests();
	const variablesToPreview = options
		? getMissingVariableKeys(requests, options)
		: new Set(requests.map(getRequestKey));

	return project.resolveVariables((request) => {
		const key = getRequestKey(request);

		if (!variablesToPreview.has(key)) {
			return Promise.resolve(undefined);
		}

		return resolvePreviewVariable();
	});
}

export async function confirmDestructiveChanges(options: {
	resourceChanges: ResourceChange[];
	patch: RailwayConfigPatch;
	autoApprove?: boolean;
}): Promise<void> {
	if (!hasDestructiveChanges(options)) {
		return;
	}

	if (options.autoApprove) {
		return;
	}

	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		throw new Error(
			[
				"Railform needs approval before applying destructive deletes.",
				"Run with --request-approval so a human can review the changes, or pass --yes to approve deletes explicitly.",
			].join("\n"),
		);
	}

	const shouldApply = await confirm({
		message:
			"Apply destructive deletes shown above? Volume deletes permanently remove stored data.",
		initialValue: false,
	});

	if (isCancel(shouldApply)) {
		cancel("Cancelled");
		throw new Error("Prompt cancelled");
	}

	if (!shouldApply) {
		cancel("Cancelled");
		throw new Error("Delete confirmation declined");
	}
}

async function promptForVariable(
	request: RailwayVariablePromptRequest,
): Promise<RailwayVariableLiteral> {
	const value = await requestPromptValue(request);

	if (isCancel(value)) {
		cancel("Cancelled");
		throw new Error("Prompt cancelled");
	}

	return value;
}

async function resolvePreviewVariable(): Promise<RailwayVariableLiteral> {
	return "*****";
}

function hasDestructiveChanges(options: {
	resourceChanges: ResourceChange[];
	patch: RailwayConfigPatch;
}): boolean {
	return (
		options.resourceChanges.some((change) => change.action === "delete") ||
		patchContainsDelete(options.patch)
	);
}

function patchContainsDelete(value: RailwayPatchValue): boolean {
	if (value === null) {
		return true;
	}

	if (Array.isArray(value)) {
		return value.some(patchContainsDelete);
	}

	if (typeof value === "object") {
		return Object.values(value).some(patchContainsDelete);
	}

	return false;
}

function getMissingVariableKeys(
	requests: RailwayVariablePromptRequest[],
	options: ResolvePromptVariableOptions,
): Set<string> {
	return new Set(
		requests
			.filter((request) => !railwayVariableExists(request, options))
			.map(getRequestKey),
	);
}

function requestPromptValue(
	request: RailwayVariablePromptRequest,
): Promise<string | symbol> {
	const message = getPromptMessage(request);
	const validate = getRequiredValidator(request);

	if (request.prompt.secret !== false) {
		return password({
			message,
			validate,
		});
	}

	return text({
		message,
		defaultValue: request.prompt.defaultValue,
		validate,
	});
}

export function getPromptVariableValues(
	assignments: string[],
): PromptVariableValues {
	const values: PromptVariableValues = {};

	for (const assignment of assignments) {
		const separator = assignment.indexOf("=");

		if (separator <= 0) {
			throw new Error(
				`Invalid --var value "${assignment}". Use KEY=value for shared variables or SERVICE.KEY=value for service variables.`,
			);
		}

		const name = assignment.slice(0, separator);
		const value = assignment.slice(separator + 1);
		values[getPromptVariableAssignmentKey(name)] = value;
	}

	return values;
}

function getPromptVariableAssignmentKey(name: string): string {
	const dot = name.indexOf(".");

	if (dot === -1) {
		return `shared:${name}`;
	}

	const serviceName = name.slice(0, dot);
	const variableName = name.slice(dot + 1);

	if (!serviceName || !variableName) {
		throw new Error(
			`Invalid --var name "${name}". Use KEY=value for shared variables or SERVICE.KEY=value for service variables.`,
		);
	}

	return `service:${serviceName}:${variableName}`;
}

function assertCanPromptForVariable(
	request: RailwayVariablePromptRequest,
): void {
	if (process.stdin.isTTY && process.stdout.isTTY) {
		return;
	}

	const name =
		request.scope === "shared"
			? request.name
			: `${request.serviceName}.${request.name}`;

	throw new Error(
		[
			`Missing value for prompt variable "${name}".`,
			`Pass it as --var ${name}=<value> or set the variable directly in Railway before applying.`,
		].join("\n"),
	);
}

function getRequiredValidator(request: RailwayVariablePromptRequest) {
	if (request.prompt.required === false) {
		return undefined;
	}

	return (value: string | undefined): string | undefined => {
		if (value && value.length > 0) {
			return undefined;
		}

		return "Value is required";
	};
}

function getPromptMessage(request: RailwayVariablePromptRequest): string {
	if (request.prompt.message) {
		return request.prompt.message;
	}

	if (request.scope === "shared") {
		return `Enter shared env variable ${request.name}`;
	}

	return `Enter env variable ${request.name} for ${request.serviceName}`;
}

function getRequestKey(request: RailwayVariablePromptRequest): string {
	if (request.scope === "shared") {
		return `shared:${request.name}`;
	}

	return `service:${request.serviceName ?? ""}:${request.name}`;
}

function getRequestLabel(request: RailwayVariablePromptRequest): string {
	if (request.scope === "shared") {
		return `shared ${request.name}`;
	}

	return `${request.serviceName ?? "service"} ${request.name}`;
}

function railwayVariableExists(
	request: RailwayVariablePromptRequest,
	options: ResolvePromptVariableOptions,
): boolean {
	if (request.scope === "shared") {
		const variables = getRecord(options.environmentConfig.sharedVariables);
		return variables?.[request.name] !== undefined;
	}

	const service = options.services.find((item) => {
		return item.name === request.serviceName;
	});

	if (!service) {
		return false;
	}

	const services = getRecord(options.environmentConfig.services);
	const serviceConfig = getRecord(services?.[service.id]);
	const variables = getRecord(serviceConfig?.variables);

	return variables?.[request.name] !== undefined;
}

function getRecord(
	value: RailwayPatchValue | undefined,
): Record<string, RailwayPatchValue> | undefined {
	if (!value) {
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
