import { defineCommand, option } from "@bunli/core";
import { booleanFlagSchema } from "../cli-options";
import { loadRailformConfig } from "../config";
import { addDeletedConfigValues } from "../plan/deletions";
import { renderPlan } from "../plan/render";
import { getResourceChanges } from "../plan/resources";
import { resolvePreviewVariables } from "../prompts";
import type { RailwayEnvironment, RailwayProject } from "../railway/project";
import { reconcileRailwayConfig } from "../railway/reconcile";
import {
	assertNoApplyingStagedChanges,
	getStagedChanges,
} from "../railway/staged-changes";
import { openRailwayProject } from "../railway/web";

export default defineCommand({
	name: "plan",
	description: "Preview Railway changes for the current configuration",
	options: {
		web: option(booleanFlagSchema, {
			description: "Open the staged Railway changes in the browser",
			argumentKind: "flag",
		}),
	},
	handler: async ({ cwd, flags }) => {
		const webEnabled = flags.web === true;
		const unresolvedConfig = await loadRailformConfig(cwd);
		const result = await reconcileRailwayConfig(cwd, unresolvedConfig, {
			allowMissing: true,
			createMissing: false,
			persistState: false,
		});
		const project = result.project;
		const environment = result.environment;
		const resourceChanges = getResourceChanges(result);
		const existing = await getExistingStagedChanges(environment.id);
		if (existing) {
			assertNoApplyingStagedChanges(existing);
		}
		const config = await resolvePreviewVariables(unresolvedConfig, {
			environmentConfig: existing?.environmentConfig ?? {},
			services: project.services,
		});
		const patch = addDeletedConfigValues({
			patch: config.toRailwayPatch({
				services: project.services,
				databases: project.databases,
			}),
			baseConfig: existing?.environmentConfig,
			project,
			config,
			reconcileResult: result,
			promptVariableRequests: unresolvedConfig.getVariablePromptRequests(),
		});

		console.log("Mode: preview (read-only)");
		renderPlan({
			project,
			environment,
			resourceChanges,
			patch,
			baseConfig: existing?.environmentConfig,
		});

		await openWebPreview(webEnabled, project, environment);
	},
});

async function getExistingStagedChanges(environmentId: string) {
	if (environmentId.length === 0) {
		return undefined;
	}

	return getStagedChanges(environmentId);
}

async function openWebPreview(
	enabled: boolean,
	project: RailwayProject,
	environment: RailwayEnvironment,
): Promise<void> {
	if (!enabled) {
		return;
	}

	if (project.id.length === 0) {
		console.log("");
		console.log("Railway project does not exist yet.");
		return;
	}

	console.log("");
	await openRailwayProject({ project, environment });
}
