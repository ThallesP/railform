import { mkdir } from "node:fs/promises";

export type RailformState = {
	version: 1;
	workspaceId?: string;
	projectId?: string;
	serviceIds?: Record<string, string>;
	projects?: Record<string, RailformProjectState>;
	approvals?: Record<string, RailformApprovalState>;
};

export type RailformProjectState = {
	id: string;
	services?: Record<string, string>;
};

export type RailformApprovalState = {
	id: string;
	status: "pending" | "approved" | "rejected" | "consumed";
	projectId: string;
	projectName: string;
	environmentId: string;
	environmentName: string;
	patchId: string;
	fingerprint: string;
	patchIsEmpty: boolean;
	resourceChanges: Array<{
		action: "add" | "delete";
		resource: "project" | "service" | "database" | "volume";
		name: string;
	}>;
	createdAt: string;
	updatedAt: string;
	approvedAt?: string;
	rejectedAt?: string;
	consumedAt?: string;
};

const stateDirectory = ".railform";
const stateFileName = "state.json";

export async function readRailformState(cwd: string): Promise<RailformState> {
	const path = getStatePath(cwd);
	const file = Bun.file(path);

	if (!(await file.exists())) {
		return createEmptyState();
	}

	try {
		return (await file.json()) as RailformState;
	} catch {
		return createEmptyState();
	}
}

export async function saveProjectId(
	cwd: string,
	projectName: string,
	projectId: string,
): Promise<void> {
	const state = await readRailformState(cwd);
	state.projectId = projectId;
	state.serviceIds = {
		...getServiceIds(state, projectName),
	};
	await writeRailformState(cwd, state);
}

export async function saveWorkspaceId(
	cwd: string,
	workspaceId: string,
): Promise<void> {
	const state = await readRailformState(cwd);
	state.workspaceId = workspaceId;
	await writeRailformState(cwd, state);
}

export async function saveServiceId(
	cwd: string,
	projectName: string,
	serviceName: string,
	serviceId: string,
): Promise<void> {
	const state = await readRailformState(cwd);

	if (!getSavedProjectId(state, projectName)) {
		throw new Error(
			`Cannot save Railway service "${serviceName}" before project "${projectName}" is saved.`,
		);
	}

	state.serviceIds = {
		...getServiceIds(state, projectName),
		[serviceName]: serviceId,
	};
	await writeRailformState(cwd, state);
}

export async function removeServiceId(
	cwd: string,
	projectName: string,
	serviceName: string,
): Promise<void> {
	const state = await readRailformState(cwd);
	const serviceIds = {
		...getServiceIds(state, projectName),
	};
	delete serviceIds[serviceName];
	state.serviceIds = serviceIds;
	await writeRailformState(cwd, state);
}

export async function saveApproval(
	cwd: string,
	approval: RailformApprovalState,
): Promise<void> {
	const state = await readRailformState(cwd);
	state.approvals = {
		...(state.approvals ?? {}),
		[approval.id]: approval,
	};
	await writeRailformState(cwd, state);
}

export async function updateApprovalStatus(
	cwd: string,
	approvalId: string,
	status: RailformApprovalState["status"],
): Promise<RailformApprovalState> {
	const state = await readRailformState(cwd);
	const approval = state.approvals?.[approvalId];

	if (!approval) {
		throw new Error(`Railform approval "${approvalId}" was not found.`);
	}

	const now = new Date().toISOString();
	const nextApproval: RailformApprovalState = {
		...approval,
		status,
		updatedAt: now,
		...(status === "approved" ? { approvedAt: now } : {}),
		...(status === "rejected" ? { rejectedAt: now } : {}),
		...(status === "consumed" ? { consumedAt: now } : {}),
	};

	state.approvals = {
		...(state.approvals ?? {}),
		[approvalId]: nextApproval,
	};
	await writeRailformState(cwd, state);

	return nextApproval;
}

export async function getApproval(
	cwd: string,
	approvalId: string,
): Promise<RailformApprovalState> {
	const state = await readRailformState(cwd);
	const approval = state.approvals?.[approvalId];

	if (!approval) {
		throw new Error(`Railform approval "${approvalId}" was not found.`);
	}

	return approval;
}

async function writeRailformState(
	cwd: string,
	state: RailformState,
): Promise<void> {
	await mkdir(getStateDirectory(cwd), { recursive: true });
	await Bun.write(
		getStatePath(cwd),
		`${JSON.stringify(getWritableState(state), null, 2)}\n`,
	);
}

export function getSavedProjectId(
	state: RailformState,
	projectName: string,
): string | undefined {
	return state.projectId ?? state.projects?.[projectName]?.id;
}

export function getSavedWorkspaceId(state: RailformState): string | undefined {
	return state.workspaceId;
}

export function getSavedServiceId(
	state: RailformState,
	projectName: string,
	serviceName: string,
): string | undefined {
	return getServiceIds(state, projectName)[serviceName];
}

function createEmptyState(): RailformState {
	return {
		version: 1,
	};
}

function getServiceIds(
	state: RailformState,
	projectName: string,
): Record<string, string> {
	return state.serviceIds ?? state.projects?.[projectName]?.services ?? {};
}

function getWritableState(state: RailformState): RailformState {
	return {
		version: 1,
		workspaceId: state.workspaceId,
		projectId: state.projectId,
		serviceIds: state.serviceIds,
		approvals: state.approvals,
	};
}

function getStatePath(cwd: string): string {
	return `${getStateDirectory(cwd)}/${stateFileName}`;
}

function getStateDirectory(cwd: string): string {
	return `${cwd}/${stateDirectory}`;
}
