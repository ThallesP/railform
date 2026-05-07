import { defineCommand } from "@bunli/core";
import { assertStagedFingerprintMatches } from "../approval";
import { renderPlan } from "../plan/render";
import {
	findProjectById,
	listProjects,
	type RailwayProject,
} from "../railway/project";
import { getStagedChanges } from "../railway/staged-changes";
import { getApproval } from "../state";

export default defineCommand({
	name: "review",
	description: "Review a pending Railform approval request",
	handler: async ({ cwd, positional }) => {
		const approvalId = getApprovalId(positional);
		const approval = await getApproval(cwd, approvalId);
		await assertStagedFingerprintMatches(approval);

		const staged = await getStagedChanges(approval.environmentId);
		const project = await getReviewProject(approval.projectId, {
			projectName: approval.projectName,
		});
		const environment = project.environments.find(
			(item) => item.id === approval.environmentId,
		) ?? {
			id: approval.environmentId,
			name: approval.environmentName,
		};

		console.log(`Approval: ${approval.id}`);
		console.log(`Status: ${approval.status}`);
		console.log(`Fingerprint: ${approval.fingerprint}`);
		console.log("");
		renderPlan({
			project,
			environment,
			resourceChanges: approval.resourceChanges,
			patch: staged.patch,
			baseConfig: staged.environmentConfig,
		});
	},
});

function getApprovalId(positional: string[]): string {
	const approvalId = positional[0];

	if (!approvalId) {
		throw new Error("Usage: railform review <approval-id>");
	}

	return approvalId;
}

async function getReviewProject(
	projectId: string,
	fallback: {
		projectName: string;
	},
): Promise<RailwayProject> {
	const project = findProjectById(await listProjects(), projectId);

	if (project) {
		return project;
	}

	return {
		id: projectId,
		name: fallback.projectName,
		environments: [],
		services: [],
		databases: [],
		volumes: [],
	};
}
