import type { ReconciledRailwayConfig } from "../railway/reconcile";
import type { ResourceChange } from "./render";

export function getResourceChanges(
	result: ReconciledRailwayConfig,
): ResourceChange[] {
	const changes: ResourceChange[] = [];

	if (result.createdProject || result.missingProject) {
		changes.push({
			action: "add",
			resource: "project",
			name: result.project.name,
		});
	}

	for (const service of getChangedServices(result)) {
		changes.push({
			action: "add",
			resource: "service",
			name: service,
		});
	}

	for (const database of getChangedDatabases(result)) {
		changes.push({
			action: "add",
			resource: "database",
			name: database,
		});
	}

	for (const service of result.deletedServices) {
		changes.push({
			action: "delete",
			resource: "service",
			name: service.name,
		});
	}

	for (const database of result.deletedDatabases) {
		changes.push({
			action: "delete",
			resource: "database",
			name: database.name,
		});
	}

	for (const volume of result.deletedVolumes) {
		changes.push({
			action: "delete",
			resource: "volume",
			name: volume.name,
		});
	}

	return changes;
}

function getChangedServices(result: ReconciledRailwayConfig): string[] {
	if (result.createdProject || result.missingProject) {
		return result.project.services.map((service) => service.name);
	}

	return [...result.createdServices, ...result.missingServices];
}

function getChangedDatabases(result: ReconciledRailwayConfig): string[] {
	if (result.createdProject || result.missingProject) {
		return result.project.databases.map((database) => database.name);
	}

	return [...result.createdDatabases, ...result.missingDatabases];
}
