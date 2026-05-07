import type {
	Project,
	RailwayConfigPatch,
	RailwayPatchValue,
} from "@railform/core";
import {
	getSavedProjectId,
	getSavedServiceId,
	getSavedWorkspaceId,
	readRailformState,
	removeServiceId,
	saveProjectId,
	saveServiceId,
	saveWorkspaceId,
} from "../state";
import {
	connectService,
	createDatabase,
	createProject,
	createService,
	deleteService,
	deleteVolume,
	findProjectById,
	getEnvironmentByName,
	listProjects,
	type RailwayEnvironment,
	type RailwayProject,
	type RailwayService,
	type RailwayVolume,
	resolveWorkspaceId,
	serviceHasSource,
	updateServiceName,
} from "./project";

export type ReconciledRailwayResource = {
	id: string;
	name: string;
};

export type ReconciledRailwayConfig = {
	project: RailwayProject;
	environment: RailwayEnvironment;
	createdProject: boolean;
	createdServices: string[];
	createdDatabases: string[];
	deletedServices: ReconciledRailwayResource[];
	deletedDatabases: ReconciledRailwayResource[];
	deletedVolumes: ReconciledRailwayResource[];
	missingProject: boolean;
	missingServices: string[];
	missingDatabases: string[];
};

export async function reconcileRailwayConfig(
	cwd: string,
	config: Project,
	options: {
		allowMissing?: boolean;
		createMissing: boolean;
		persistState?: boolean;
	},
): Promise<ReconciledRailwayConfig> {
	const projectResult = await reconcileProject(cwd, config, options);
	const environment = getEnvironment(projectResult.project, config);
	const serviceResult = await reconcileServices(
		cwd,
		projectResult.project,
		environment,
		config,
		options,
	);
	const databaseResult = await reconcileDatabases(
		projectResult.project,
		environment,
		config,
		options,
	);
	const deletedDatabases = getDeletedDatabases(
		projectResult.project,
		environment,
		config,
	);
	const deletedServices = getDeletedServices(
		projectResult.project,
		environment,
		config,
	);
	const deletedVolumes = getDeletedVolumes(projectResult.project, environment, {
		deletedServices,
		deletedDatabases,
	});

	return {
		project: projectResult.project,
		environment,
		createdProject: projectResult.created,
		createdServices: serviceResult.created,
		createdDatabases: databaseResult.created,
		deletedServices,
		deletedDatabases,
		deletedVolumes,
		missingProject: projectResult.missing,
		missingServices: serviceResult.missing,
		missingDatabases: databaseResult.missing,
	};
}

async function reconcileProject(
	cwd: string,
	config: Project,
	options: {
		allowMissing?: boolean;
		createMissing: boolean;
		persistState?: boolean;
	},
) {
	const state = await readRailformState(cwd);
	const savedProjectId = getSavedProjectId(state, config.name);
	const projects = await listProjects();

	if (savedProjectId) {
		const savedProject = findProjectById(projects, savedProjectId);

		if (savedProject) {
			return {
				project: savedProject,
				created: false,
				missing: false,
			};
		}
	}

	if (options.allowMissing) {
		return {
			project: createPreviewProject(config),
			created: false,
			missing: true,
		};
	}

	if (!options.createMissing) {
		throw new Error(`Railway project "${config.name}" was not found`);
	}

	const project = await createProject({
		name: config.name,
		environmentName: config.environment,
		workspaceId: await resolveWorkspaceId({
			savedWorkspaceId: getSavedWorkspaceId(state),
			context: `project "${config.name}"`,
		}),
	});

	if (options.persistState !== false) {
		if (project.workspaceId) {
			await saveWorkspaceId(cwd, project.workspaceId);
		}
		await saveProjectId(cwd, project.name, project.id);
	}

	return {
		project,
		created: true,
		missing: false,
	};
}

async function reconcileDatabases(
	project: RailwayProject,
	environment: RailwayEnvironment,
	config: Project,
	options: {
		allowMissing?: boolean;
		createMissing: boolean;
	},
): Promise<{
	created: string[];
	missing: string[];
}> {
	const createdDatabases: string[] = [];
	const missingDatabases: string[] = [];

	for (const database of config.databases) {
		const existingDatabase = project.databases.find((item) => {
			return (
				item.name === database.name &&
				databaseIsInEnvironmentScope(item, environment)
			);
		});

		if (existingDatabase) {
			continue;
		}

		if (options.allowMissing) {
			project.databases.push({
				id: database.name,
				name: database.name,
				type: database.type,
				environmentIds: [environment.id],
			});
			missingDatabases.push(database.name);
			continue;
		}

		if (!options.createMissing) {
			throw new Error(
				`Railway database "${database.name}" was not found in project "${project.name}"`,
			);
		}

		const createdDatabase = await createRailwayDatabase({
			project,
			environment,
			name: database.name,
			type: database.type,
		});

		project.databases.push(createdDatabase);
		createdDatabases.push(createdDatabase.name);
	}

	return {
		created: createdDatabases,
		missing: missingDatabases,
	};
}

async function createRailwayDatabase(options: {
	project: RailwayProject;
	environment: RailwayEnvironment;
	name: string;
	type: string;
}): Promise<Awaited<ReturnType<typeof createDatabase>>> {
	try {
		return await createDatabase({
			projectId: options.project.id,
			environmentId: options.environment.id,
			workspaceId: options.project.workspaceId,
			name: options.name,
			type: options.type,
		});
	} catch (error) {
		throw new Error(
			`Could not create Railway database "${options.name}" (${options.type}) in project "${options.project.name}" / environment "${options.environment.name}": ${getErrorMessage(error)}`,
		);
	}
}

async function reconcileServices(
	cwd: string,
	project: RailwayProject,
	environment: RailwayEnvironment,
	config: Project,
	options: {
		allowMissing?: boolean;
		createMissing: boolean;
		persistState?: boolean;
	},
): Promise<{
	created: string[];
	missing: string[];
}> {
	const state = await readRailformState(cwd);
	const createdServices: string[] = [];
	const missingServices: string[] = [];

	for (const service of config.services) {
		const existingService = project.services.find((item) => {
			return (
				item.name === service.name &&
				serviceHasEnvironmentInstance(item, environment)
			);
		});

		if (existingService) {
			if (options.persistState !== false) {
				await saveServiceId(
					cwd,
					project.name,
					service.name,
					existingService.id,
				);
			}
			await connectExistingServiceSource({
				shouldConnect: options.createMissing,
				serviceId: existingService.id,
				hasSource: serviceHasSource(existingService, service.source),
				source: service.source,
			});
			continue;
		}

		if (options.allowMissing) {
			project.services.push({
				id: service.name,
				name: service.name,
			});
			missingServices.push(service.name);
			continue;
		}

		const savedServiceId = getSavedServiceId(state, project.name, service.name);

		if (savedServiceId) {
			const savedService = project.services.find((item) => {
				return item.id === savedServiceId;
			});

			if (savedService) {
				const reconciledService = await reconcileSavedService({
					shouldRepair: options.createMissing,
					environment,
					service: savedService,
					name: service.name,
					source: service.source,
				});

				if (reconciledService) {
					project.services.push(reconciledService);
					continue;
				}
			}
		}

		if (!options.createMissing) {
			throw new Error(
				`Railway service "${service.name}" was not found in project "${project.name}"`,
			);
		}

		await renameConflictingOrphanService({
			project,
			environment,
			name: service.name,
		});

		const createdService = await createService({
			projectId: project.id,
			environmentId: environment.id,
			name: service.name,
			source: service.source,
		});

		project.services.push(createdService);

		if (options.persistState !== false) {
			await saveServiceId(cwd, project.name, service.name, createdService.id);
		}

		createdServices.push(createdService.name);
	}

	return {
		created: createdServices,
		missing: missingServices,
	};
}

async function renameConflictingOrphanService(options: {
	project: RailwayProject;
	environment: RailwayEnvironment;
	name: string;
}): Promise<void> {
	const conflictingService = options.project.services.find((service) => {
		return (
			service.name === options.name &&
			!serviceHasEnvironmentInstance(service, options.environment)
		);
	});

	if (!conflictingService) {
		return;
	}

	const nextName = `${options.name}-orphan-${conflictingService.id.slice(0, 8)}`;
	await updateServiceName({
		serviceId: conflictingService.id,
		name: nextName,
	});
	conflictingService.name = nextName;
}

async function reconcileSavedService(options: {
	shouldRepair: boolean;
	environment: RailwayEnvironment;
	service: RailwayService;
	name: string;
	source: Parameters<typeof connectService>[0]["source"] | undefined;
}): Promise<RailwayService | undefined> {
	let service = options.service;

	if (!serviceHasEnvironmentInstance(service, options.environment)) {
		return undefined;
	}

	if (options.shouldRepair && service.name !== options.name) {
		service = {
			...service,
			...(await updateServiceName({
				serviceId: service.id,
				name: options.name,
			})),
		};
	}

	await connectExistingServiceSource({
		shouldConnect: options.shouldRepair,
		serviceId: service.id,
		hasSource: serviceHasSource(service, options.source),
		source: options.source,
	});

	return {
		...service,
		name: options.name,
	};
}

function serviceHasEnvironmentInstance(
	service: RailwayService,
	environment: RailwayEnvironment,
): boolean {
	return (
		service.instances?.some((instance) => {
			return instance.environmentId === environment.id;
		}) ?? false
	);
}

async function connectExistingServiceSource(options: {
	shouldConnect: boolean;
	serviceId: string;
	hasSource: boolean;
	source: Parameters<typeof connectService>[0]["source"] | undefined;
}) {
	if (!options.shouldConnect || !options.source || options.hasSource) {
		return;
	}

	await connectService({
		serviceId: options.serviceId,
		source: options.source,
	});
}

export async function deleteRailwayResources(
	cwd: string,
	result: ReconciledRailwayConfig,
): Promise<void> {
	for (const service of result.deletedServices) {
		await deleteServiceOrVerify({
			result,
			serviceId: service.id,
		});
		await removeServiceId(cwd, result.project.name, service.name);
		console.log(`Deleted Railway service ${service.name}`);
	}

	for (const database of result.deletedDatabases) {
		await deleteServiceOrVerify({
			result,
			serviceId: database.id,
		});
		console.log(`Deleted Railway database ${database.name}`);
	}

	for (const volume of result.deletedVolumes) {
		await deleteVolumeOrVerify({
			result,
			volumeId: volume.id,
		});
		console.log(`Deleted Railway volume ${volume.name}`);
	}
}

async function deleteServiceOrVerify(options: {
	result: ReconciledRailwayConfig;
	serviceId: string;
}): Promise<void> {
	try {
		await deleteService({
			serviceId: options.serviceId,
			environmentId: options.result.environment.id,
		});
		return;
	} catch (error) {
		if (
			await resourceWasDeleted(() => {
				return serviceStillExists(options.result.project.id, options.serviceId);
			})
		) {
			return;
		}

		throw error;
	}
}

async function deleteVolumeOrVerify(options: {
	result: ReconciledRailwayConfig;
	volumeId: string;
}): Promise<void> {
	try {
		await deleteVolume({ volumeId: options.volumeId });
		return;
	} catch (error) {
		if (
			await resourceWasDeleted(() => {
				return volumeStillExists(options.result.project.id, options.volumeId);
			})
		) {
			return;
		}

		throw error;
	}
}

async function serviceStillExists(
	projectId: string,
	serviceId: string,
): Promise<boolean> {
	const project = await getFreshProject(projectId);

	if (!project) {
		return false;
	}

	return project.services.some((service) => service.id === serviceId);
}

async function volumeStillExists(
	projectId: string,
	volumeId: string,
): Promise<boolean> {
	const project = await getFreshProject(projectId);

	if (!project) {
		return false;
	}

	return project.volumes.some((volume) => {
		return volume.id === volumeId && !volumeIsDeleted(volume);
	});
}

async function getFreshProject(
	projectId: string,
): Promise<RailwayProject | undefined> {
	return findProjectById(await listProjects(), projectId);
}

async function resourceWasDeleted(
	stillExists: () => Promise<boolean>,
): Promise<boolean> {
	for (let attempt = 0; attempt < 6; attempt += 1) {
		try {
			if (!(await stillExists())) {
				return true;
			}
		} catch {
			// Keep the original delete error if read-back verification never succeeds.
		}

		await sleep(1500);
	}

	return false;
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function getDeletedDatabases(
	project: RailwayProject,
	environment: RailwayEnvironment,
	config: Project,
): ReconciledRailwayResource[] {
	const desiredDatabaseNames = new Set(
		config.databases.map((database) => database.name),
	);

	return uniqueResources(
		project.databases
			.filter((database) => {
				return (
					databaseIsInEnvironmentScope(database, environment) &&
					!desiredDatabaseNames.has(database.name)
				);
			})
			.map((database) => ({
				id: database.id,
				name: database.name,
			})),
	);
}

function getDeletedServices(
	project: RailwayProject,
	environment: RailwayEnvironment,
	config: Project,
): ReconciledRailwayResource[] {
	const desiredServiceNames = new Set(
		config.services.map((service) => service.name),
	);
	const desiredServiceIds = new Set(
		project.services
			.filter((service) => {
				return (
					desiredServiceNames.has(service.name) &&
					serviceIsInEnvironmentScope(service, environment)
				);
			})
			.map((service) => service.id),
	);
	const databaseServiceIds = new Set(
		project.databases.map((database) => database.id),
	);

	return uniqueResources(
		project.services
			.filter((service) => {
				return (
					serviceIsInEnvironmentScope(service, environment) &&
					!databaseServiceIds.has(service.id) &&
					!desiredServiceNames.has(service.name) &&
					!desiredServiceIds.has(service.id)
				);
			})
			.map((service) => ({
				id: service.id,
				name: service.name,
			})),
	);
}

function getDeletedVolumes(
	project: RailwayProject,
	environment: RailwayEnvironment,
	deleted: {
		deletedServices: ReconciledRailwayResource[];
		deletedDatabases: ReconciledRailwayResource[];
	},
): ReconciledRailwayResource[] {
	const deletedServiceIds = new Set([
		...deleted.deletedServices.map((service) => service.id),
		...deleted.deletedDatabases.map((database) => database.id),
	]);
	const configuredVolumeIds = getConfiguredVolumeIds(environment);
	const volumeIdsWithOtherEnvironmentInstances = new Set(
		project.volumes
			.filter((volume) => volume.environmentId !== environment.id)
			.map((volume) => volume.id),
	);

	return uniqueResources(
		project.volumes
			.filter((volume) => {
				return (
					volumeIsInEnvironmentScope(volume, environment) &&
					!volumeIdsWithOtherEnvironmentInstances.has(volume.id) &&
					!volumeIsDeleted(volume) &&
					(volumeBelongsToDeletedService(volume, deletedServiceIds) ||
						volumeIsDetachedConfiguredVolume(volume, configuredVolumeIds))
				);
			})
			.map((volume) => ({
				id: volume.id,
				name: volume.name,
			})),
	);
}

function serviceIsInEnvironmentScope(
	service: RailwayService,
	environment: RailwayEnvironment,
): boolean {
	return (
		serviceHasEnvironmentInstance(service, environment) ||
		hasNoInstances(service)
	);
}

function volumeIsInEnvironmentScope(
	volume: RailwayVolume,
	environment: RailwayEnvironment,
): boolean {
	return volume.environmentId === environment.id;
}

function databaseIsInEnvironmentScope(
	database: RailwayProject["databases"][number],
	environment: RailwayEnvironment,
): boolean {
	return (
		database.environmentIds.includes(environment.id) ||
		database.environmentIds.length === 0
	);
}

function volumeBelongsToDeletedService(
	volume: RailwayVolume,
	deletedServiceIds: Set<string>,
): boolean {
	return Boolean(volume.serviceId && deletedServiceIds.has(volume.serviceId));
}

function volumeIsDetachedConfiguredVolume(
	volume: RailwayVolume,
	configuredVolumeIds: Set<string>,
): boolean {
	return !volume.serviceId && configuredVolumeIds.has(volume.id);
}

function volumeIsDeleted(volume: RailwayVolume): boolean {
	return volume.state === "DELETED" || volume.state === "DELETING";
}

function getConfiguredVolumeIds(environment: RailwayEnvironment): Set<string> {
	const volumes = getRecord(environment.config?.volumes);

	if (!volumes) {
		return new Set();
	}

	return new Set(Object.keys(volumes));
}

function getRecord(
	value: RailwayPatchValue | undefined,
): RailwayConfigPatch | undefined {
	if (value === undefined || value === null) {
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

function hasNoInstances(service: RailwayService): boolean {
	return (service.instances?.length ?? 0) === 0;
}

function uniqueResources(
	resources: ReconciledRailwayResource[],
): ReconciledRailwayResource[] {
	const resourcesById = new Map<string, ReconciledRailwayResource>();

	for (const resource of resources) {
		resourcesById.set(resource.id, resource);
	}

	return [...resourcesById.values()];
}

function getEnvironment(
	project: RailwayProject,
	config: Project,
): RailwayEnvironment {
	if (project.id.length === 0) {
		return {
			id: "",
			name: config.environment,
		};
	}

	return getEnvironmentByName(project, config.environment);
}

function createPreviewProject(config: Project): RailwayProject {
	return {
		id: "",
		name: config.name,
		environments: [
			{
				id: "",
				name: config.environment,
			},
		],
		services: config.services.map((service) => {
			return {
				id: service.name,
				name: service.name,
				instances: [
					{
						environmentId: "",
						serviceId: service.name,
					},
				],
			};
		}),
		databases: config.databases.map((database) => {
			return {
				id: database.name,
				name: database.name,
				type: database.type,
				environmentIds: [""],
			};
		}),
		volumes: [],
	};
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
