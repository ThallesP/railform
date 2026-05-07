import { cancel, isCancel, select } from "@clack/prompts";
import type { RailwayConfigPatch } from "@railform/core";
import { graphql, mutateRailway, requestRailway } from "./client";

export type RailwayProject = {
	id: string;
	name: string;
	workspaceId?: string;
	environments: RailwayEnvironment[];
	services: RailwayService[];
	databases: RailwayDatabase[];
	volumes: RailwayVolume[];
};

export type RailwayEnvironment = {
	id: string;
	name: string;
	config?: RailwayConfigPatch;
};

export type RailwayService = {
	id: string;
	name: string;
	templateId?: string;
	templateServiceId?: string;
	instances?: RailwayServiceInstance[];
};

type RailwayServiceInstance = {
	environmentId: string;
	serviceId: string;
	source?: {
		image?: string | null;
		repo?: string | null;
	} | null;
};

export type RailwayServiceSource = {
	image?: string;
	repo?: string;
	branch?: string;
};

export type RailwayDatabase = {
	id: string;
	name: string;
	type: string;
	environmentIds: string[];
};

export type RailwayVolume = {
	id: string;
	name: string;
	environmentId: string;
	serviceId?: string;
	mountPath: string;
	state?: string;
};

type TemplateVariable = {
	isOptional?: boolean;
	description?: string;
	defaultValue: string;
};

type DatabaseTemplate = {
	templateId: string;
	icon: string;
	sourceImage: string;
	build?: Record<string, never>;
	deploy?: Record<string, unknown>;
	variables: Record<string, TemplateVariable>;
	port: string;
	volumeMountPath: string;
};

export type RailwayWorkspace = {
	id: string;
	name: string;
};

const secretAlphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const workflowPollIntervalMs = 2000;
const workflowProgressIntervalMs = 30_000;
const defaultWorkflowTimeoutMs = 10 * 60 * 1000;

function railwayExpression(expression: string): string {
	return ["$", "{{", expression, "}}"].join("");
}

const UserProjectsQuery = graphql(`
	query RailformUserProjects {
		me {
			workspaces {
				id
				projects(first: 500) {
					edges {
						node {
							id
							name
							workspaceId
							environments {
								edges {
									node {
										id
										name
										config
										serviceInstances {
											edges {
												node {
													environmentId
													serviceId
													source {
														image
														repo
													}
												}
											}
										}
										volumeInstances {
											edges {
												node {
													environmentId
													serviceId
													volumeId
													mountPath
													state
													volume {
														id
														name
													}
												}
											}
										}
									}
								}
							}
							services {
								edges {
									node {
										id
										name
										templateId
										templateServiceId
									}
								}
							}
						}
					}
				}
			}
		}
	}
`);

const RootProjectsQuery = graphql(`
	query RailformRootProjects {
		projects {
			edges {
				node {
					id
					name
					workspaceId
					environments {
						edges {
							node {
								id
								name
								config
								serviceInstances {
									edges {
										node {
											environmentId
											serviceId
											source {
												image
												repo
											}
										}
									}
								}
								volumeInstances {
									edges {
										node {
											environmentId
											serviceId
											volumeId
											mountPath
											state
											volume {
												id
												name
											}
										}
									}
								}
							}
						}
					}
					services {
						edges {
							node {
								id
								name
								templateId
								templateServiceId
							}
						}
					}
				}
			}
		}
	}
`);

const WorkspacesQuery = graphql(`
	query RailformWorkspaces {
		me {
			workspaces {
				id
				name
			}
		}
	}
`);

const CreateProjectMutation = graphql(`
	mutation RailformCreateProject($input: ProjectCreateInput!) {
		projectCreate(input: $input) {
			id
			name
			workspaceId
			environments {
				edges {
					node {
						id
						name
						config
						serviceInstances {
							edges {
								node {
									environmentId
									serviceId
									source {
										image
										repo
									}
								}
							}
						}
						volumeInstances {
							edges {
								node {
									environmentId
									serviceId
									volumeId
									mountPath
									state
									volume {
										id
										name
									}
								}
							}
						}
					}
				}
			}
			services {
				edges {
					node {
						id
						name
						templateId
						templateServiceId
					}
				}
			}
		}
	}
`);

const CreateServiceMutation = graphql(`
	mutation RailformCreateService($input: ServiceCreateInput!) {
		serviceCreate(input: $input) {
			id
			name
		}
	}
`);

const UpdateServiceMutation = graphql(`
	mutation RailformUpdateService($id: String!, $input: ServiceUpdateInput!) {
		serviceUpdate(id: $id, input: $input) {
			id
			name
		}
	}
`);

const ConnectServiceMutation = graphql(`
	mutation RailformConnectService($id: String!, $input: ServiceConnectInput!) {
		serviceConnect(id: $id, input: $input) {
			id
			name
		}
	}
`);

const DeleteServiceMutation = graphql(`
	mutation RailformDeleteService($id: String!, $environmentId: String) {
		serviceDelete(id: $id, environmentId: $environmentId)
	}
`);

const DeleteVolumeMutation = graphql(`
	mutation RailformDeleteVolume($volumeId: String!) {
		volumeDelete(volumeId: $volumeId)
	}
`);

const DeployDatabaseTemplateMutation = graphql(`
	mutation RailformDeployDatabaseTemplate($input: TemplateDeployV2Input!) {
		templateDeployV2(input: $input) {
			projectId
			workflowId
		}
	}
`);

const WorkflowStatusQuery = graphql(`
	query RailformWorkflowStatus($workflowId: String!) {
		workflowStatus(workflowId: $workflowId) {
			status
			error
		}
	}
`);

const postgresTemplate: DatabaseTemplate = {
	templateId: "b55da7dc-09be-4140-bc65-1284d15d349c",
	icon: "https://devicons.railway.app/i/postgresql.svg",
	sourceImage: "ghcr.io/railwayapp-templates/postgres-ssl:18",
	build: {},
	deploy: {
		requiredMountPath: "/var/lib/postgresql/data",
	},
	port: "5432",
	volumeMountPath: "/var/lib/postgresql/data",
	variables: {
		PGDATA: {
			isOptional: false,
			description: "Location where the database will be initialized",
			defaultValue: "/var/lib/postgresql/data/pgdata",
		},
		PGHOST: {
			isOptional: false,
			description: "Railway Private Domain Name.",
			defaultValue: railwayExpression("RAILWAY_PRIVATE_DOMAIN"),
		},
		PGPORT: {
			isOptional: false,
			description: "Port to connect to Postgres.",
			defaultValue: "5432",
		},
		PGUSER: {
			isOptional: false,
			description: "Required variable for Data panel",
			defaultValue: railwayExpression(" POSTGRES_USER "),
		},
		PGDATABASE: {
			isOptional: false,
			description: "Required variable for the data panel.",
			defaultValue: railwayExpression("POSTGRES_DB"),
		},
		PGPASSWORD: {
			isOptional: false,
			description: "Required variable for Data panel",
			defaultValue: railwayExpression("POSTGRES_PASSWORD"),
		},
		POSTGRES_DB: {
			isOptional: false,
			description: "Default database created when image is started.",
			defaultValue: "railway",
		},
		DATABASE_URL: {
			isOptional: false,
			description: "URL to connect to Postgres database.",
			defaultValue: `postgresql://${railwayExpression("PGUSER")}:${railwayExpression("POSTGRES_PASSWORD")}@${railwayExpression("RAILWAY_PRIVATE_DOMAIN")}:5432/${railwayExpression("PGDATABASE")}`,
		},
		POSTGRES_USER: {
			isOptional: false,
			description: "User to connect to Postgres DB",
			defaultValue: "postgres",
		},
		SSL_CERT_DAYS: {
			isOptional: true,
			description: "SSL certificate expiry in days.",
			defaultValue: "820",
		},
		POSTGRES_PASSWORD: {
			isOptional: false,
			description: "Password to connect to DB",
			defaultValue: railwayExpression(` secret(32, "${secretAlphabet}") `),
		},
		DATABASE_PUBLIC_URL: {
			description:
				"Public URL to connect to Postgres database, used by the Data panel.",
			defaultValue: `postgresql://${railwayExpression("PGUSER")}:${railwayExpression("POSTGRES_PASSWORD")}@${railwayExpression("RAILWAY_TCP_PROXY_DOMAIN")}:${railwayExpression("RAILWAY_TCP_PROXY_PORT")}/${railwayExpression("PGDATABASE")}`,
		},
		RAILWAY_DEPLOYMENT_DRAINING_SECONDS: {
			isOptional: false,
			description: "Allow Postgres to cleanly shut down",
			defaultValue: "60",
		},
	},
};

const redisTemplate: DatabaseTemplate = {
	templateId: "895cb7c9-8ea9-4407-b4b6-b5013a65145e",
	icon: "https://cdn.sanity.io/images/sy1jschh/production/0ce0bfdcfbdbf69662b1116671f97c2dd788b655-157x157.svg",
	sourceImage: "redis:8.2.1",
	deploy: {
		requiredMountPath: "/data",
		startCommand:
			'/bin/sh -c "rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH"',
	},
	port: "6379",
	volumeMountPath: "/data",
	variables: {
		REDISHOST: {
			defaultValue: railwayExpression("RAILWAY_PRIVATE_DOMAIN"),
		},
		REDISPORT: {
			defaultValue: "6379",
		},
		REDISUSER: {
			defaultValue: "default",
		},
		REDIS_URL: {
			defaultValue: `redis://${railwayExpression("REDISUSER")}:${railwayExpression("REDIS_PASSWORD")}@${railwayExpression("REDISHOST")}:${railwayExpression("REDISPORT")}`,
		},
		REDISPASSWORD: {
			defaultValue: railwayExpression("REDIS_PASSWORD"),
		},
		REDIS_PASSWORD: {
			defaultValue: railwayExpression(` secret(32, "${secretAlphabet}") `),
		},
		REDIS_PUBLIC_URL: {
			defaultValue: `redis://default:${railwayExpression("REDIS_PASSWORD")}@${railwayExpression("RAILWAY_TCP_PROXY_DOMAIN")}:${railwayExpression("RAILWAY_TCP_PROXY_PORT")}`,
		},
	},
};

export async function listProjects(): Promise<RailwayProject[]> {
	try {
		const result = await requestRailway(UserProjectsQuery, {});

		return result.me.workspaces.flatMap((workspace) => {
			return workspace.projects.edges.map((edge) => {
				return toRailwayProject({
					...edge.node,
					workspaceId: edge.node.workspaceId ?? workspace.id,
				});
			});
		});
	} catch (error) {
		if (!isNotAuthorizedError(error)) {
			throw error;
		}
	}

	const result = await requestRailway(RootProjectsQuery, {});

	return result.projects.edges.map((edge) => {
		return toRailwayProject(edge.node);
	});
}

export async function listWorkspaces(): Promise<RailwayWorkspace[]> {
	const result = await requestRailway(WorkspacesQuery, {});

	return result.me.workspaces.map((workspace) => ({
		id: workspace.id,
		name: workspace.name,
	}));
}

export function findProjectById(
	projects: RailwayProject[],
	id: string,
): RailwayProject | undefined {
	return projects.find((item) => item.id === id);
}

export function findProjectByName(
	projects: RailwayProject[],
	name: string,
): RailwayProject | undefined {
	return projects.find((item) => item.name === name);
}

export async function createProject(options: {
	name: string;
	environmentName: string;
	workspaceId?: string;
}): Promise<RailwayProject> {
	const result = await mutateRailway(CreateProjectMutation, {
		input: {
			name: options.name,
			defaultEnvironmentName: options.environmentName,
			workspaceId: options.workspaceId,
		},
	});

	return toRailwayProject(result.projectCreate);
}

export async function createService(options: {
	projectId: string;
	environmentId: string;
	name: string;
	source?: RailwayServiceSource;
}): Promise<RailwayService> {
	const result = await mutateRailway(CreateServiceMutation, {
		input: {
			projectId: options.projectId,
			environmentId: options.environmentId,
			name: options.name,
			...buildServiceSourceInput(options.source),
		},
	});

	return result.serviceCreate;
}

export async function updateServiceName(options: {
	serviceId: string;
	name: string;
}): Promise<RailwayService> {
	const result = await mutateRailway(UpdateServiceMutation, {
		id: options.serviceId,
		input: {
			name: options.name,
		},
	});

	return result.serviceUpdate;
}

export async function connectService(options: {
	serviceId: string;
	source: RailwayServiceSource;
}): Promise<RailwayService> {
	const result = await mutateRailway(ConnectServiceMutation, {
		id: options.serviceId,
		input: buildServiceConnectInput(options.source),
	});

	return result.serviceConnect;
}

export async function deleteService(options: {
	serviceId: string;
	environmentId?: string;
}): Promise<void> {
	const result = await mutateRailway(DeleteServiceMutation, {
		id: options.serviceId,
		environmentId: options.environmentId,
	});

	if (!result.serviceDelete) {
		throw new Error(`Railway service "${options.serviceId}" was not deleted.`);
	}
}

export async function deleteVolume(options: {
	volumeId: string;
}): Promise<void> {
	const result = await mutateRailway(DeleteVolumeMutation, {
		volumeId: options.volumeId,
	});

	if (!result.volumeDelete) {
		throw new Error(`Railway volume "${options.volumeId}" was not deleted.`);
	}
}

export function serviceHasSource(
	service: RailwayService,
	source: RailwayServiceSource | undefined,
): boolean {
	if (!source) {
		return true;
	}

	return (
		service.instances?.some((instance) => {
			if (source.image) {
				return instance.source?.image === source.image;
			}

			return instance.source?.repo === source.repo;
		}) ?? false
	);
}

function buildServiceSourceInput(source: RailwayServiceSource | undefined): {
	source?: {
		image?: string;
		repo?: string;
	};
	branch?: string;
} {
	if (!source) {
		return {};
	}

	if (source.image) {
		return {
			source: {
				image: source.image,
			},
		};
	}

	return {
		source: {
			repo: source.repo,
		},
		branch: source.branch,
	};
}

function buildServiceConnectInput(source: RailwayServiceSource): {
	image?: string;
	repo?: string;
	branch?: string;
} {
	if (source.image) {
		return {
			image: source.image,
		};
	}

	return {
		repo: source.repo,
		branch: source.branch,
	};
}

function isNotAuthorizedError(error: unknown): boolean {
	return (
		error instanceof Error &&
		error.message.toLowerCase().includes("not authorized")
	);
}

export async function resolveWorkspaceId(options: {
	workspaceId?: string;
	context: string;
}): Promise<string> {
	if (options.workspaceId) {
		return options.workspaceId;
	}

	const environmentWorkspaceId = process.env.RAILWAY_WORKSPACE_ID?.trim();

	if (environmentWorkspaceId) {
		return environmentWorkspaceId;
	}

	const workspaces = await listWorkspaces();

	if (workspaces.length === 0) {
		throw new Error("No Railway workspaces are available for this login.");
	}

	if (workspaces.length === 1) {
		const workspace = workspaces[0];

		if (!workspace) {
			throw new Error("No Railway workspaces are available for this login.");
		}

		return workspace.id;
	}

	if (!process.stdout.isTTY) {
		throw new Error(
			[
				`Railform needs a Railway workspaceId for ${options.context}.`,
				"Add `workspaceId` to railform.config.ts or set RAILWAY_WORKSPACE_ID.",
				"Available workspaces:",
				...workspaces.map(
					(workspace) => `  - ${workspace.name}: ${workspace.id}`,
				),
			].join("\n"),
		);
	}

	const selected = await select({
		message: `Select a Railway workspace for ${options.context}`,
		options: workspaces.map((workspace) => ({
			value: workspace.id,
			label: workspace.name,
			hint: workspace.id,
		})),
	});

	if (isCancel(selected)) {
		cancel("Cancelled");
		throw new Error("Prompt cancelled");
	}

	return selected;
}

export async function createDatabase(options: {
	projectId: string;
	environmentId: string;
	workspaceId?: string;
	name: string;
	type: string;
}): Promise<RailwayDatabase> {
	const serviceId = crypto.randomUUID();
	const template = getDatabaseTemplate(options.type);

	const result = await mutateRailway(DeployDatabaseTemplateMutation, {
		input: buildDatabaseTemplateDeployInput({
			...options,
			serviceId,
			template,
		}),
	});

	if (result.templateDeployV2.workflowId) {
		await waitForWorkflow({
			workflowId: result.templateDeployV2.workflowId,
			label: `Railway ${options.type} database "${options.name}" template deploy`,
		});
	}

	return {
		id: serviceId,
		name: options.name,
		type: options.type,
		environmentIds: [options.environmentId],
	};
}

async function waitForWorkflow(options: {
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

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
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

export function getEnvironmentByName(
	project: RailwayProject,
	name: string,
): RailwayEnvironment {
	const environment = project.environments.find((item) => item.name === name);

	if (!environment) {
		throw new Error(
			`Railway environment "${name}" was not found in project "${project.name}"`,
		);
	}

	return environment;
}

function toRailwayProject(project: {
	id: string;
	name: string;
	workspaceId?: string | null;
	environments: {
		edges: Array<{
			node: {
				id: string;
				name: string;
				config?: unknown;
				serviceInstances: {
					edges: Array<{
						node: RailwayServiceInstance;
					}>;
				};
				volumeInstances: {
					edges: Array<{
						node: RailwayVolumeInstance;
					}>;
				};
			};
		}>;
	};
	services: {
		edges: Array<{
			node: {
				id: string;
				name: string;
				templateId?: string | null;
				templateServiceId?: string | null;
			};
		}>;
	};
}): RailwayProject {
	const serviceInstancesByServiceId = groupServiceInstancesByServiceId(
		project.environments.edges.flatMap((environmentEdge) => {
			return environmentEdge.node.serviceInstances.edges.map(
				(edge) => edge.node,
			);
		}),
	);
	const services = project.services.edges.map((edge) => {
		return toRailwayService(
			edge.node,
			serviceInstancesByServiceId.get(edge.node.id) ?? [],
		);
	});
	const volumes = project.environments.edges.flatMap((environmentEdge) => {
		return environmentEdge.node.volumeInstances.edges.map((edge) => {
			return toRailwayVolume(edge.node);
		});
	});

	return {
		id: project.id,
		name: project.name,
		workspaceId: project.workspaceId ?? undefined,
		environments: project.environments.edges.map((edge) => {
			return {
				id: edge.node.id,
				name: edge.node.name,
				config: edge.node.config as RailwayConfigPatch | undefined,
			};
		}),
		services,
		databases: services.flatMap((service) => {
			const database = toRailwayDatabaseService(service);
			return database ? [database] : [];
		}),
		volumes,
	};
}

function groupServiceInstancesByServiceId(
	instances: RailwayServiceInstance[],
): Map<string, RailwayServiceInstance[]> {
	const groups = new Map<string, RailwayServiceInstance[]>();

	for (const instance of instances) {
		const group = groups.get(instance.serviceId) ?? [];
		group.push(instance);
		groups.set(instance.serviceId, group);
	}

	return groups;
}

function toRailwayService(
	service: {
		id: string;
		name: string;
		templateId?: string | null;
		templateServiceId?: string | null;
	},
	instances: RailwayServiceInstance[],
): RailwayService {
	return {
		id: service.id,
		name: service.name,
		templateId: service.templateId ?? undefined,
		templateServiceId: service.templateServiceId ?? undefined,
		instances,
	};
}

type RailwayVolumeInstance = {
	environmentId: string;
	serviceId?: string | null;
	volumeId: string;
	mountPath: string;
	state?: string | null;
	volume: {
		id: string;
		name: string;
	};
};

function toRailwayVolume(volumeInstance: RailwayVolumeInstance): RailwayVolume {
	return {
		id: volumeInstance.volume.id,
		name: volumeInstance.volume.name,
		environmentId: volumeInstance.environmentId,
		serviceId: volumeInstance.serviceId ?? undefined,
		mountPath: volumeInstance.mountPath,
		state: volumeInstance.state ?? undefined,
	};
}

function toRailwayDatabaseService(
	service: RailwayService,
): RailwayDatabase | undefined {
	const type = getDatabaseTypeFromService(service);

	if (!type) {
		return undefined;
	}

	return {
		id: service.id,
		name: service.name,
		type,
		environmentIds:
			service.instances?.map((instance) => instance.environmentId) ?? [],
	};
}

function getDatabaseTypeFromService(
	service: RailwayService,
): string | undefined {
	const images =
		service.instances?.flatMap((instance) => {
			return instance.source?.image ? [instance.source.image] : [];
		}) ?? [];

	if (
		service.templateId === postgresTemplate.templateId ||
		images.some((image) =>
			image.startsWith("ghcr.io/railwayapp-templates/postgres-ssl:"),
		)
	) {
		return "postgresql";
	}

	if (
		service.templateId === redisTemplate.templateId ||
		images.some((image) => image.startsWith("redis:"))
	) {
		return "redis";
	}

	return undefined;
}

function getDatabaseTemplate(type: string): DatabaseTemplate {
	if (type === "postgresql") {
		return postgresTemplate;
	}

	if (type === "redis") {
		return redisTemplate;
	}

	throw new Error(
		`Railway database type "${type}" is not supported by the current template deploy path. Supported types: postgresql, redis.`,
	);
}

function buildDatabaseTemplateDeployInput(options: {
	projectId: string;
	environmentId: string;
	workspaceId?: string;
	name: string;
	serviceId: string;
	template: DatabaseTemplate;
}) {
	const serviceConfig = {
		icon: options.template.icon,
		name: options.name,
		build: options.template.build ?? {},
		deploy: options.template.deploy ?? {},
		source: {
			image: options.template.sourceImage,
		},
		variables: options.template.variables,
		networking: {
			tcpProxies: {
				[options.template.port]: {},
			},
			serviceDomains: {},
		},
		volumeMounts: {
			[options.serviceId]: {
				mountPath: options.template.volumeMountPath,
			},
		},
	};

	return {
		projectId: options.projectId,
		environmentId: options.environmentId,
		workspaceId: options.workspaceId,
		templateId: options.template.templateId,
		serializedConfig: {
			services: {
				[options.serviceId]: serviceConfig,
			},
		},
	};
}
