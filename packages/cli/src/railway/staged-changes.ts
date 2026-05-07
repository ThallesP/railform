import type { RailwayConfigPatch } from "@railform/core";
import { graphql, mutateRailway, requestRailway } from "./client";

export type EnvironmentPatch = {
	id: string;
	status: string;
	message: string | null;
	patch: RailwayConfigPatch;
	environmentConfig: RailwayConfigPatch;
	createdAt: string;
	updatedAt: string;
	lastAppliedError: string | null;
};

const stagedChangesPollIntervalMs = 2000;
const stagedChangesProgressIntervalMs = 15_000;
const defaultStagedChangesTimeoutMs = 2 * 60 * 1000;
const workflowPollIntervalMs = 2000;
const workflowProgressIntervalMs = 30_000;
const defaultWorkflowTimeoutMs = 10 * 60 * 1000;

export function assertNoApplyingStagedChanges(staged: EnvironmentPatch): void {
	if (staged.status !== "APPLYING") {
		return;
	}

	const message = staged.message ? ` "${staged.message}"` : "";

	throw new Error(
		`Railway staged changes are still applying${message} (patch ${staged.id}, updated ${staged.updatedAt}). Wait for Railway to finish or clear the stuck staged changes before running Railform again.`,
	);
}

export async function waitForStagedChangesReady(
	environmentId: string,
): Promise<EnvironmentPatch> {
	const timeoutMs = getStagedChangesTimeoutMs();
	const deadline = Date.now() + timeoutMs;
	let nextProgressAt = Date.now() + stagedChangesProgressIntervalMs;

	for (;;) {
		const staged = await getStagedChanges(environmentId);

		if (staged.status !== "APPLYING") {
			return staged;
		}

		const now = Date.now();

		if (now >= deadline) {
			assertNoApplyingStagedChanges(staged);
		}

		if (now >= nextProgressAt) {
			const message = staged.message ? ` "${staged.message}"` : "";
			console.log(`Waiting for Railway staged changes${message} to finish`);
			nextProgressAt = now + stagedChangesProgressIntervalMs;
		}

		await sleep(Math.min(stagedChangesPollIntervalMs, deadline - now));
	}
}

const EnvironmentStagedChangesQuery = graphql(`
	query RailformEnvironmentStagedChanges($environmentId: String!) {
		environment(id: $environmentId) {
			id
			name
			config
		}
		environmentStagedChanges(environmentId: $environmentId) {
			id
			status
			message
			patch
			createdAt
			updatedAt
			lastAppliedError
		}
	}
`);

const StageEnvironmentChangesMutation = graphql(`
	mutation RailformStageEnvironmentChanges(
		$environmentId: String!
		$input: EnvironmentConfig!
		$merge: Boolean
	) {
		environmentStageChanges(
			environmentId: $environmentId
			input: $input
			merge: $merge
		) {
			id
			status
			message
			patch
			createdAt
			updatedAt
			lastAppliedError
		}
	}
`);

const CommitStagedChangesMutation = graphql(`
	mutation RailformCommitStagedChanges(
		$environmentId: String!
		$commitMessage: String
		$skipDeploys: Boolean
	) {
		environmentPatchCommitStaged(
			environmentId: $environmentId
			commitMessage: $commitMessage
			skipDeploys: $skipDeploys
		)
	}
`);

const WorkflowStatusQuery = graphql(`
	query RailformCommitWorkflowStatus($workflowId: String!) {
		workflowStatus(workflowId: $workflowId) {
			status
			error
		}
	}
`);

export async function getStagedChanges(
	environmentId: string,
): Promise<EnvironmentPatch> {
	const result = await requestRailway(EnvironmentStagedChangesQuery, {
		environmentId,
	});

	return toEnvironmentPatch(
		result.environmentStagedChanges,
		result.environment.config as RailwayConfigPatch,
	);
}

export async function stageEnvironmentChanges(options: {
	environmentId: string;
	input: RailwayConfigPatch;
	merge: boolean;
}): Promise<EnvironmentPatch> {
	const result = await mutateRailway(StageEnvironmentChangesMutation, {
		environmentId: options.environmentId,
		input: options.input,
		merge: options.merge,
	});

	return toEnvironmentPatch(result.environmentStageChanges, {});
}

export async function commitStagedChanges(options: {
	environmentId: string;
	commitMessage: string;
	skipDeploys: boolean;
}): Promise<string> {
	const result = await mutateRailway(CommitStagedChangesMutation, {
		environmentId: options.environmentId,
		commitMessage: options.commitMessage,
		skipDeploys: options.skipDeploys,
	});

	return result.environmentPatchCommitStaged;
}

export async function waitForWorkflow(options: {
	workflowId: string;
	label: string;
}): Promise<void> {
	const timeoutMs = getWorkflowTimeoutMs();
	const deadline = Date.now() + timeoutMs;
	let nextProgressAt = Date.now() + workflowProgressIntervalMs;

	for (;;) {
		const result = await requestRailway(WorkflowStatusQuery, {
			workflowId: options.workflowId,
		});
		const workflow = result.workflowStatus;

		if (workflow.status === "Complete") {
			return;
		}

		if (workflow.status === "Error" || workflow.status === "NotFound") {
			throw new Error(
				`${options.label} failed with workflow status ${workflow.status}: ${workflow.error ?? "no error details"}`,
			);
		}

		const now = Date.now();

		if (now >= deadline) {
			break;
		}

		if (now >= nextProgressAt) {
			console.log(
				`Waiting for ${options.label} (${workflow.status}, workflow ${options.workflowId})`,
			);
			nextProgressAt = now + workflowProgressIntervalMs;
		}

		await sleep(Math.min(workflowPollIntervalMs, deadline - now));
	}

	throw new Error(
		`${options.label} did not finish after ${formatDuration(timeoutMs)} (workflow ${options.workflowId})`,
	);
}

function toEnvironmentPatch(
	patch: {
		id: string;
		status: string;
		message: string | null;
		patch: unknown;
		createdAt: unknown;
		updatedAt: unknown;
		lastAppliedError: string | null;
	},
	environmentConfig: RailwayConfigPatch,
): EnvironmentPatch {
	return {
		id: patch.id,
		status: patch.status,
		message: patch.message,
		patch: patch.patch as RailwayConfigPatch,
		environmentConfig,
		createdAt: String(patch.createdAt),
		updatedAt: String(patch.updatedAt),
		lastAppliedError: patch.lastAppliedError,
	};
}

function getStagedChangesTimeoutMs(): number {
	const timeoutSeconds = Number(
		process.env.RAILFORM_STAGED_CHANGES_TIMEOUT_SECONDS,
	);

	if (Number.isFinite(timeoutSeconds) && timeoutSeconds > 0) {
		return timeoutSeconds * 1000;
	}

	return defaultStagedChangesTimeoutMs;
}

function getWorkflowTimeoutMs(): number {
	const timeoutSeconds = Number(process.env.RAILFORM_WORKFLOW_TIMEOUT_SECONDS);

	if (Number.isFinite(timeoutSeconds) && timeoutSeconds > 0) {
		return timeoutSeconds * 1000;
	}

	return defaultWorkflowTimeoutMs;
}

function formatDuration(ms: number): string {
	const seconds = Math.round(ms / 1000);

	if (seconds % 60 === 0) {
		return `${seconds / 60}m`;
	}

	return `${seconds}s`;
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
