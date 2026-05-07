import { expect, test } from "bun:test";
import { Project, Service, promptVariable } from "@railform/core";
import { resolvePromptVariables } from "../prompts";
import { addDeletedConfigValues } from "./deletions";

const environment = { id: "env", name: "production" };

const project = {
	id: "project",
	name: "My Railway Project",
	environments: [environment],
	services: [{ id: "svc_web", name: "web" }],
	databases: [],
	volumes: [],
};

const baseConfig = {
	services: {
		svc_web: {
			variables: {
				API_TOKEN: { value: "*****" },
			},
		},
	},
};

const reconcileResult = {
	project,
	environment,
	createdProject: false,
	createdServices: [],
	createdDatabases: [],
	deletedServices: [],
	deletedDatabases: [],
	deletedVolumes: [],
	missingProject: false,
	missingServices: [],
	missingDatabases: [],
};

test("preserves existing prompt variables that were omitted from the resolved patch", async () => {
	const unresolvedConfig = new Project({
		name: "My Railway Project",
		services: [
			new Service({
				name: "web",
				variables: {
					API_TOKEN: promptVariable("API token"),
				},
			}),
		],
	});
	const config = await resolvePromptVariables(unresolvedConfig, {
		environmentConfig: baseConfig,
		services: project.services,
	});

	const patch = addDeletedConfigValues({
		patch: config.toRailwayPatch({
			services: project.services,
			databases: project.databases,
		}),
		baseConfig,
		project,
		config,
		reconcileResult,
		promptVariableRequests: unresolvedConfig.getVariablePromptRequests(),
	});

	expect(patch).toEqual({});
});

test("deletes existing variables that are no longer declared in config", () => {
	const config = new Project({
		name: "My Railway Project",
		services: [new Service({ name: "web" })],
	});

	const patch = addDeletedConfigValues({
		patch: config.toRailwayPatch({
			services: project.services,
			databases: project.databases,
		}),
		baseConfig,
		project,
		config,
		reconcileResult,
		promptVariableRequests: config.getVariablePromptRequests(),
	});

	expect(patch).toEqual({
		services: {
			svc_web: {
				variables: {
					API_TOKEN: null,
				},
			},
		},
	});
});
