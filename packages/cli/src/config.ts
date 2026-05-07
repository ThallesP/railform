import type { Project } from "@railform/core";

export async function loadRailformConfig(cwd: string): Promise<Project> {
	const configPath = `${cwd}/railform.config.ts`;
	const module = await import(configPath);
	const config = module.default;

	if (!isRailformProject(config)) {
		throw new Error("railform.config.ts must default export a Project");
	}

	return config;
}

function isRailformProject(value: unknown): value is Project {
	if (!value || typeof value !== "object") {
		return false;
	}

	const candidate = value as Partial<Project>;

	return (
		typeof candidate.name === "string" &&
		typeof candidate.environment === "string" &&
		Array.isArray(candidate.services) &&
		Array.isArray(candidate.databases) &&
		typeof candidate.getVariablePromptRequests === "function" &&
		typeof candidate.resolveVariables === "function" &&
		typeof candidate.toRailwayPatch === "function"
	);
}
