import type { RailwayConfigPatch, RailwayPatchValue } from "@railform/core";
import type { RailwayEnvironment, RailwayProject } from "../railway/project";

export type ResourceChange = {
	action: "add" | "delete";
	resource: "project" | "service" | "database" | "volume";
	name: string;
};

export function renderPlan(options: {
	project: RailwayProject;
	environment: RailwayEnvironment;
	resourceChanges?: ResourceChange[];
	patch: RailwayConfigPatch;
	baseConfig?: RailwayConfigPatch;
}): void {
	console.log(`Project: ${options.project.name}`);
	console.log(`Environment: ${options.environment.name}`);
	console.log("");
	console.log("Plan:");

	for (const line of getPlanLines(options)) {
		console.log(line);
	}
}

export function patchIsEmpty(patch: RailwayConfigPatch): boolean {
	return Object.keys(patch).length === 0;
}

function getChangeLines(options: {
	project: RailwayProject;
	patch: RailwayConfigPatch;
	baseConfig?: RailwayConfigPatch;
}): string[] {
	const lines: string[] = [];
	const baseConfig = options.baseConfig ?? {};

	collectSharedVariableLines(options.patch, baseConfig, lines);
	collectServiceLines(options.patch, baseConfig, options.project, lines);
	collectVolumeLines(options.patch, baseConfig, options.project, lines);
	collectOtherLines(options.patch, baseConfig, lines);

	if (lines.length === 0) {
		return ["No changes"];
	}

	return lines;
}

function getPlanLines(options: {
	project: RailwayProject;
	resourceChanges?: ResourceChange[];
	patch: RailwayConfigPatch;
	baseConfig?: RailwayConfigPatch;
}): string[] {
	const resourceLines = getResourceChangeLines(options.resourceChanges ?? []);
	const stagedLines = getChangeLines(options);
	const hasStagedChanges = stagedLines[0] !== "No changes";

	if (resourceLines.length === 0) {
		return stagedLines;
	}

	if (!hasStagedChanges) {
		return resourceLines;
	}

	return [...resourceLines, "", "Staged changes:", ...stagedLines];
}

function getResourceChangeLines(changes: ResourceChange[]): string[] {
	const lines: string[] = [];

	for (const change of changes) {
		if (change.action === "delete") {
			if (change.resource === "database") {
				lines.push(`[-] delete Railway database ${change.name}`);
				continue;
			}

			if (change.resource === "volume") {
				lines.push(
					`[-] delete Railway volume ${change.name} (persistent data)`,
				);
				continue;
			}

			lines.push(`[-] delete Railway ${change.resource} ${change.name}`);
			continue;
		}

		lines.push(`[+] create Railway ${change.resource} ${change.name}`);
	}

	return lines;
}

function collectSharedVariableLines(
	patch: RailwayConfigPatch,
	baseConfig: RailwayConfigPatch,
	lines: string[],
): void {
	const sharedVariables = getRecord(patch.sharedVariables);
	const baseVariables = getRecord(baseConfig.sharedVariables);

	if (!sharedVariables) {
		return;
	}

	for (const [name, variable] of Object.entries(sharedVariables)) {
		const baseVariable = getRecord(baseVariables?.[name]);
		const action = getAction(
			baseVariable?.value,
			getVariableRawValue(variable),
		);
		const value = getVariableValue(variable);
		lines.push(formatSharedVariableLine(action, name, value));
	}
}

function collectServiceLines(
	patch: RailwayConfigPatch,
	baseConfig: RailwayConfigPatch,
	project: RailwayProject,
	lines: string[],
): void {
	const services = getRecord(patch.services);
	const baseServices = getRecord(baseConfig.services);

	if (!services) {
		return;
	}

	for (const [serviceId, servicePatch] of Object.entries(services)) {
		const serviceName = getServiceName(project, serviceId);
		const baseServicePatch = baseServices?.[serviceId];

		collectServiceVariableLines(
			serviceName,
			servicePatch,
			baseServicePatch,
			lines,
		);
		collectServiceDeployLines(
			serviceName,
			servicePatch,
			baseServicePatch,
			lines,
		);
		collectServiceOtherLines(
			serviceName,
			servicePatch,
			baseServicePatch,
			lines,
		);
	}
}

function collectServiceVariableLines(
	serviceName: string,
	servicePatch: RailwayPatchValue,
	baseServicePatch: RailwayPatchValue | undefined,
	lines: string[],
): void {
	const patch = getRecord(servicePatch);
	const variables = getRecord(patch?.variables);
	const basePatch = getRecord(baseServicePatch);
	const baseVariables = getRecord(basePatch?.variables);

	if (!variables) {
		return;
	}

	for (const [name, variable] of Object.entries(variables)) {
		const baseVariable = getRecord(baseVariables?.[name]);
		const action = getAction(
			baseVariable?.value,
			getVariableRawValue(variable),
		);
		const value = getVariableValue(variable);
		lines.push(formatServiceVariableLine(action, name, serviceName, value));
	}
}

function collectServiceDeployLines(
	serviceName: string,
	servicePatch: RailwayPatchValue,
	baseServicePatch: RailwayPatchValue | undefined,
	lines: string[],
): void {
	const patch = getRecord(servicePatch);
	const deploy = getRecord(patch?.deploy);
	const basePatch = getRecord(baseServicePatch);
	const baseDeploy = getRecord(basePatch?.deploy);

	if (!deploy) {
		return;
	}

	for (const [name, value] of Object.entries(deploy)) {
		const action = getAction(baseDeploy?.[name], value);
		lines.push(formatDeployLine(action, name, serviceName, value));
	}
}

function collectServiceOtherLines(
	serviceName: string,
	servicePatch: RailwayPatchValue,
	baseServicePatch: RailwayPatchValue | undefined,
	lines: string[],
): void {
	const patch = getRecord(servicePatch);
	const basePatch = getRecord(baseServicePatch);

	if (!patch) {
		return;
	}

	for (const key of Object.keys(patch)) {
		if (key !== "variables" && key !== "deploy") {
			const action = getAction(basePatch?.[key], patch[key]);
			lines.push(
				formatGenericLine(action, `${formatKey(key)} for ${serviceName}`),
			);
		}
	}
}

function collectOtherLines(
	patch: RailwayConfigPatch,
	baseConfig: RailwayConfigPatch,
	lines: string[],
): void {
	for (const key of Object.keys(patch)) {
		if (key !== "sharedVariables" && key !== "services" && key !== "volumes") {
			const action = getAction(baseConfig[key], patch[key]);
			lines.push(formatGenericLine(action, formatKey(key)));
		}
	}
}

function collectVolumeLines(
	patch: RailwayConfigPatch,
	baseConfig: RailwayConfigPatch,
	project: RailwayProject,
	lines: string[],
): void {
	const volumes = getRecord(patch.volumes);
	const baseVolumes = getRecord(baseConfig.volumes);

	if (!volumes) {
		return;
	}

	for (const [volumeId, volumePatch] of Object.entries(volumes)) {
		const action = getAction(baseVolumes?.[volumeId], volumePatch);
		const volumeName = getVolumeName(project, volumeId);
		lines.push(formatVolumeLine(action, volumeName));
	}
}

function getServiceName(project: RailwayProject, serviceId: string): string {
	const service = project.services.find((item) => item.id === serviceId);

	if (!service) {
		return serviceId;
	}

	return service.name;
}

function getVolumeName(project: RailwayProject, volumeId: string): string {
	const volume = project.volumes.find((item) => item.id === volumeId);

	if (!volume) {
		return volumeId;
	}

	return volume.name;
}

function getVariableValue(value: RailwayPatchValue): string {
	return formatValue(getVariableRawValue(value));
}

function getVariableRawValue(
	value: RailwayPatchValue,
): RailwayPatchValue | undefined {
	const variable = getRecord(value);

	if (!variable) {
		return value;
	}

	return variable.value;
}

function formatSharedVariableLine(
	action: PlanAction,
	name: string,
	value: string,
): string {
	if (action.kind === "remove") {
		return `${action.prefix} remove shared env variable ${name}`;
	}

	return `${action.prefix} ${action.verb} shared env variable ${name} = ${value}`;
}

function formatServiceVariableLine(
	action: PlanAction,
	name: string,
	serviceName: string,
	value: string,
): string {
	if (action.kind === "remove") {
		return `${action.prefix} remove env variable ${name} from ${serviceName}`;
	}

	return `${action.prefix} ${action.verb} env variable ${name} to ${serviceName} = ${value}`;
}

function formatDeployLine(
	action: PlanAction,
	name: string,
	serviceName: string,
	value: RailwayPatchValue,
): string {
	const label = formatKey(name);

	if (action.kind === "remove") {
		return `${action.prefix} remove ${label} from ${serviceName}`;
	}

	return `${action.prefix} ${action.verb} ${label} for ${serviceName} = ${formatValue(value)}`;
}

function formatGenericLine(action: PlanAction, label: string): string {
	if (action.kind === "remove") {
		return `${action.prefix} remove ${label}`;
	}

	return `${action.prefix} ${action.verb} ${label}`;
}

function formatVolumeLine(action: PlanAction, volumeName: string): string {
	if (action.kind === "remove") {
		return `${action.prefix} remove Railway volume config ${volumeName}`;
	}

	return `${action.prefix} ${action.verb} Railway volume config ${volumeName}`;
}

function formatKey(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[-_]/g, " ")
		.toLowerCase();
}

function formatValue(value: RailwayPatchValue | undefined): string {
	if (value === undefined) {
		return "unset";
	}

	if (value === "*****") {
		return "a redacted value";
	}

	if (typeof value === "string") {
		return `"${value}"`;
	}

	if (value === null) {
		return "unset";
	}

	if (Array.isArray(value)) {
		return `${value.length} items`;
	}

	if (typeof value === "object") {
		return "an object";
	}

	return String(value);
}

type PlanAction = {
	kind: "add" | "update" | "remove";
	prefix: "[+]" | "[~]" | "[-]";
	verb: "add" | "update" | "remove";
};

function getAction(
	baseValue: RailwayPatchValue | undefined,
	plannedValue: RailwayPatchValue | undefined,
): PlanAction {
	if (plannedValue === null) {
		return {
			kind: "remove",
			prefix: "[-]",
			verb: "remove",
		};
	}

	if (baseValue === undefined) {
		return {
			kind: "add",
			prefix: "[+]",
			verb: "add",
		};
	}

	return {
		kind: "update",
		prefix: "[~]",
		verb: "update",
	};
}

function getRecord(
	value: RailwayPatchValue | undefined,
): Record<string, RailwayPatchValue> | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (value === null) {
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
