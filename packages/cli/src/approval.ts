import type { RailwayConfigPatch } from "@railform/core";
import { fingerprintPatch } from "./plan/fingerprint";
import type { ResourceChange } from "./plan/render";
import type { RailwayEnvironment, RailwayProject } from "./railway/project";
import { getStagedChanges } from "./railway/staged-changes";
import {
	getApproval,
	type RailformApprovalState,
	saveApproval,
	updateApprovalStatus,
} from "./state";

export type ApprovalReport = {
	status: "approval_required";
	approvalId: string;
	project: {
		id: string;
		name: string;
	};
	environment: {
		id: string;
		name: string;
	};
	fingerprint: string;
	reviewCommand: string;
	approveCommand: string;
	rejectCommand: string;
	continueCommand: string;
};

export async function createApprovalRequest(options: {
	cwd: string;
	project: RailwayProject;
	environment: RailwayEnvironment;
	patchId: string;
	patch: RailwayConfigPatch;
	patchIsEmpty: boolean;
	resourceChanges: ResourceChange[];
}): Promise<ApprovalReport> {
	const fingerprint = await fingerprintPatch(options.patch);
	const approvalId = createApprovalId(fingerprint);
	const now = new Date().toISOString();

	await saveApproval(options.cwd, {
		id: approvalId,
		status: "pending",
		projectId: options.project.id,
		projectName: options.project.name,
		environmentId: options.environment.id,
		environmentName: options.environment.name,
		patchId: options.patchId,
		fingerprint,
		patchIsEmpty: options.patchIsEmpty,
		resourceChanges: options.resourceChanges,
		createdAt: now,
		updatedAt: now,
	});

	return toApprovalReport({
		approvalId,
		project: options.project,
		environment: options.environment,
		fingerprint,
	});
}

export async function approveRailformApproval(
	cwd: string,
	approvalId: string,
): Promise<RailformApprovalState> {
	const approval = await getApproval(cwd, approvalId);

	if (approval.status !== "pending") {
		throw new Error(
			`Railform approval "${approvalId}" is ${approval.status}, not pending.`,
		);
	}

	await assertStagedFingerprintMatches(approval);

	return updateApprovalStatus(cwd, approvalId, "approved");
}

export async function rejectRailformApproval(
	cwd: string,
	approvalId: string,
): Promise<RailformApprovalState> {
	const approval = await getApproval(cwd, approvalId);

	if (approval.status !== "pending") {
		throw new Error(
			`Railform approval "${approvalId}" is ${approval.status}, not pending.`,
		);
	}

	return updateApprovalStatus(cwd, approvalId, "rejected");
}

export async function getApprovedApproval(
	cwd: string,
	approvalId: string,
): Promise<RailformApprovalState> {
	const approval = await getApproval(cwd, approvalId);

	if (approval.status !== "approved") {
		throw new Error(
			`Railform approval "${approvalId}" is ${approval.status}, not approved.`,
		);
	}

	await assertStagedFingerprintMatches(approval);

	return approval;
}

export async function assertStagedFingerprintMatches(
	approval: RailformApprovalState,
): Promise<void> {
	const staged = await getStagedChanges(approval.environmentId);
	const fingerprint = await fingerprintPatch(staged.patch);

	if (fingerprint !== approval.fingerprint) {
		throw new Error(
			[
				`Railform approval "${approval.id}" no longer matches Railway staged changes.`,
				`Approved fingerprint: ${approval.fingerprint}`,
				`Current fingerprint: ${fingerprint}`,
				"Run railform apply --request-approval again so the human can review the current changes.",
			].join("\n"),
		);
	}
}

export function approvalSkipPermissionsEnabled(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	const value = env.RAILFORM_DANGEROUSLY_SKIP_PERMISSIONS?.trim().toLowerCase();

	return value === "1" || value === "true" || value === "yes";
}

function toApprovalReport(options: {
	approvalId: string;
	project: RailwayProject;
	environment: RailwayEnvironment;
	fingerprint: string;
}): ApprovalReport {
	return {
		status: "approval_required",
		approvalId: options.approvalId,
		project: {
			id: options.project.id,
			name: options.project.name,
		},
		environment: {
			id: options.environment.id,
			name: options.environment.name,
		},
		fingerprint: options.fingerprint,
		reviewCommand: `railform review ${options.approvalId}`,
		approveCommand: `railform approve ${options.approvalId}`,
		rejectCommand: `railform reject ${options.approvalId}`,
		continueCommand: `railform apply --approval ${options.approvalId} --wait --format json`,
	};
}

function createApprovalId(fingerprint: string): string {
	return `rf_${fingerprint.replace(/^sha256:/, "").slice(0, 12)}`;
}
