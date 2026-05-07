import { defineCommand, option } from "@bunli/core";
import {
	approvalSkipPermissionsEnabled,
	createApprovalRequest,
	getApprovedApproval,
} from "../approval";
import {
	booleanFlagSchema,
	optionalStringSchema,
	repeatableStringSchema,
} from "../cli-options";
import { loadRailformConfig } from "../config";
import { addDeletedConfigValues } from "../plan/deletions";
import {
	fingerprintPatch,
	getPatchShapeFingerprint,
} from "../plan/fingerprint";
import { createPlanMessage, getMessageFingerprint } from "../plan/messages";
import { patchIsEmpty, renderPlan } from "../plan/render";
import { getResourceChanges } from "../plan/resources";
import {
	confirmDestructiveChanges,
	getPromptVariableValues,
	resolvePromptVariables,
} from "../prompts";
import type { RailwayEnvironment, RailwayProject } from "../railway/project";
import {
	deleteRailwayResources,
	reconcileRailwayConfig,
} from "../railway/reconcile";
import {
	commitStagedChanges,
	type EnvironmentPatch,
	stageEnvironmentChanges,
	waitForStagedChangesReady,
	waitForWorkflow,
} from "../railway/staged-changes";
import { updateApprovalStatus } from "../state";

export default defineCommand({
	name: "apply",
	description: "Apply the current configuration to Railway",
	options: {
		"request-approval": option(booleanFlagSchema, {
			description: "Stage changes and create a human approval request",
			argumentKind: "flag",
		}),
		approval: option(optionalStringSchema, {
			description: "Continue an apply after a human approved this approval ID",
		}),
		yes: option(booleanFlagSchema, {
			description: "Approve destructive deletes without prompting",
			argumentKind: "flag",
		}),
		wait: option(booleanFlagSchema, {
			description: "Wait for the Railway commit workflow to finish",
			argumentKind: "flag",
		}),
		var: option(repeatableStringSchema, {
			description:
				"Prompt variable value as KEY=value for shared vars or SERVICE.KEY=value for service vars",
			repeatable: true,
		}),
	},
	handler: async (args) => {
		await withSuppressedConsole(args.format !== "toon", async () => {
			const { cwd, env, flags, format, output } = args;
			const waitEnabled = flags.wait === true;

			if (flags.approval) {
				await applyApprovedChanges({
					cwd,
					approvalId: flags.approval,
					wait: waitEnabled,
					format,
					output,
				});
				return;
			}

			const dangerouslySkipPermissions = approvalSkipPermissionsEnabled(env);
			const requestApproval =
				flags["request-approval"] === true && !dangerouslySkipPermissions;
			const autoApproveDeletes =
				flags.yes === true || dangerouslySkipPermissions;

			if (flags["request-approval"] === true && dangerouslySkipPermissions) {
				console.warn(
					"RAILFORM_DANGEROUSLY_SKIP_PERMISSIONS is set; applying without a human approval request.",
				);
			}

			const unresolvedConfig = await loadRailformConfig(cwd);
			const existing = await reconcileRailwayConfig(cwd, unresolvedConfig, {
				allowMissing: true,
				createMissing: false,
				persistState: false,
			});

			if (existing.environment.id.length > 0) {
				await waitForStagedChangesReady(existing.environment.id);
			}

			const result = await reconcileRailwayConfig(cwd, unresolvedConfig, {
				createMissing: true,
			});
			const project = result.project;
			const environment = result.environment;
			const staged = await waitForStagedChangesReady(environment.id);
			const promptOptions = {
				environmentConfig: staged.environmentConfig,
				services: project.services,
				values: getPromptVariableValues(flags.var),
			};
			const config = await resolvePromptVariables(unresolvedConfig, {
				...promptOptions,
			});
			const resourceChanges = getResourceChanges(result);
			const patch = addDeletedConfigValues({
				patch: config.toRailwayPatch({
					services: project.services,
					databases: project.databases,
				}),
				baseConfig: staged.environmentConfig,
				project,
				config,
				reconcileResult: result,
				promptVariableRequests: unresolvedConfig.getVariablePromptRequests(),
			});

			if (patchIsEmpty(patch)) {
				renderPlan({
					project,
					environment,
					resourceChanges,
					patch,
					baseConfig: staged.environmentConfig,
				});

				if (requestApproval) {
					const report = await createApprovalRequest({
						cwd,
						project,
						environment,
						patchId: staged.id,
						patch,
						patchIsEmpty: true,
						resourceChanges,
					});
					writeApprovalReport(report, { format, output });
					return;
				}

				await confirmDestructiveChanges({
					resourceChanges,
					patch,
					autoApprove: autoApproveDeletes,
				});
				await deleteRailwayResources(cwd, result);
				writeApplyReport({ project, environment }, { format, output });
				return;
			}

			const plannedShape = getPatchShapeFingerprint(patch);
			const existingShape = getPatchShapeFingerprint(staged.patch);

			if (!patchIsEmpty(staged.patch) && existingShape !== plannedShape) {
				throw new Error(
					`Environment "${environment.name}" already has staged changes for different config keys. Apply or clear them before applying Railform config.`,
				);
			}

			const nextStaged = await stageEnvironmentChanges({
				environmentId: environment.id,
				input: patch,
				merge: false,
			});

			renderPlan({
				project,
				environment,
				resourceChanges,
				patch: nextStaged.patch,
				baseConfig: staged.environmentConfig,
			});

			if (patchIsEmpty(nextStaged.patch)) {
				if (requestApproval) {
					const report = await createApprovalRequest({
						cwd,
						project,
						environment,
						patchId: nextStaged.id,
						patch: nextStaged.patch,
						patchIsEmpty: true,
						resourceChanges,
					});
					writeApprovalReport(report, { format, output });
					return;
				}

				await confirmDestructiveChanges({
					resourceChanges,
					patch: nextStaged.patch,
					autoApprove: autoApproveDeletes,
				});
				await deleteRailwayResources(cwd, result);
				writeApplyReport({ project, environment }, { format, output });
				return;
			}

			if (requestApproval) {
				const report = await createApprovalRequest({
					cwd,
					project,
					environment,
					patchId: nextStaged.id,
					patch: nextStaged.patch,
					patchIsEmpty: false,
					resourceChanges,
				});
				writeApprovalReport(report, { format, output });
				return;
			}

			await confirmDestructiveChanges({
				resourceChanges,
				patch: nextStaged.patch,
				autoApprove: autoApproveDeletes,
			});
			await commitRenderedStagedChanges(project, environment, nextStaged, {
				wait: waitEnabled,
				human: format === "toon",
			});
			await deleteRailwayResources(cwd, result);
			writeApplyReport({ project, environment }, { format, output });
		});
	},
});

async function applyApprovedChanges(options: {
	cwd: string;
	approvalId: string;
	wait: boolean;
	format: string;
	output: (data: unknown) => void;
}): Promise<void> {
	const approval = await getApprovedApproval(options.cwd, options.approvalId);
	const staged = await waitForStagedChangesReady(approval.environmentId);
	const unresolvedConfig = await loadRailformConfig(options.cwd);
	const result = await reconcileRailwayConfig(options.cwd, unresolvedConfig, {
		allowMissing: true,
		createMissing: false,
		persistState: false,
	});

	if (!approval.patchIsEmpty) {
		await commitRenderedStagedChanges(
			result.project,
			result.environment,
			staged,
			{
				wait: options.wait,
				human: options.format === "toon",
			},
		);
	}

	await deleteRailwayResources(options.cwd, result);
	await updateApprovalStatus(options.cwd, approval.id, "consumed");

	if (options.format !== "toon") {
		options.output({
			ok: true,
			data: {
				status: "applied",
				approvalId: approval.id,
				project: {
					id: approval.projectId,
					name: approval.projectName,
				},
				environment: {
					id: approval.environmentId,
					name: approval.environmentName,
				},
			},
		});
		return;
	}

	console.log(`Consumed approval ${approval.id}`);
}

async function commitRenderedStagedChanges(
	project: RailwayProject,
	environment: RailwayEnvironment,
	staged: EnvironmentPatch,
	options: {
		wait: boolean;
		human: boolean;
	},
): Promise<void> {
	const fingerprint = await fingerprintPatch(staged.patch);
	const messageFingerprint = getMessageFingerprint(staged.message);

	if (messageFingerprint && messageFingerprint !== fingerprint) {
		throw new Error(
			`Staged changes fingerprint changed from ${messageFingerprint} to ${fingerprint}. Run railform apply again.`,
		);
	}

	if (options.human) {
		console.log("");
	}

	const workflowId = await commitStagedChanges({
		environmentId: environment.id,
		commitMessage: createPlanMessage(project.name, fingerprint),
		skipDeploys: false,
	});

	if (options.human) {
		console.log(`Committed staged changes: ${workflowId}`);
	}

	if (options.wait) {
		await waitForWorkflow({
			workflowId,
			label: `Railway staged changes commit for ${project.name}/${environment.name}`,
		});
		if (options.human) {
			console.log(`Railway commit workflow completed: ${workflowId}`);
		}
	}
}

async function withSuppressedConsole<T>(
	enabled: boolean,
	run: () => Promise<T>,
): Promise<T> {
	if (!enabled) {
		return run();
	}

	const log = console.log;
	const warn = console.warn;

	console.log = () => {};
	console.warn = () => {};

	try {
		return await run();
	} finally {
		console.log = log;
		console.warn = warn;
	}
}

function writeApprovalReport(
	report: Awaited<ReturnType<typeof createApprovalRequest>>,
	options: {
		format: string;
		output: (data: unknown) => void;
	},
): void {
	if (options.format !== "toon") {
		options.output({
			ok: true,
			data: report,
		});
		return;
	}

	console.log("");
	console.log("Approval required.");
	console.log(`Approval ID: ${report.approvalId}`);
	console.log(`Review: ${report.reviewCommand}`);
	console.log(`Approve: ${report.approveCommand}`);
	console.log(`Reject: ${report.rejectCommand}`);
	console.log(`Continue: ${report.continueCommand}`);
}

function writeApplyReport(
	report: {
		project: RailwayProject;
		environment: RailwayEnvironment;
	},
	options: {
		format: string;
		output: (data: unknown) => void;
	},
): void {
	if (options.format === "toon") {
		return;
	}

	options.output({
		ok: true,
		data: {
			status: "applied",
			project: {
				id: report.project.id,
				name: report.project.name,
			},
			environment: {
				id: report.environment.id,
				name: report.environment.name,
			},
		},
	});
}
