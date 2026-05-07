import type {
	RailwayConfigPatch,
	RailwayDatabaseRef,
	RailwayPatchContext,
	RailwayVariablePromptRequest,
	RailwayVariableResolver,
	RailwayVariables,
	RailwayVariableValue,
	ResolvedRailwayVariables,
} from "./types";
import { formatVariables, isPromptVariable } from "./types";

export type ServiceDeployProps = {
	buildCommand?: string;
	cronSchedule?: string;
	dockerfilePath?: string;
	drainingSeconds?: number;
	healthcheckPath?: string;
	healthcheckTimeout?: number;
	overlapSeconds?: number;
	numReplicas?: number;
	preDeployCommand?: string[];
	region?: string;
	restartPolicyMaxRetries?: number;
	restartPolicyType?: ServiceRestartPolicyType;
	rootDirectory?: string;
	sleepApplication?: boolean;
	startCommand?: string;
	watchPatterns?: string[];
};

export type ServiceRestartPolicyType = "NEVER" | "ON_FAILURE" | "ALWAYS";

export type ServiceProps = {
	name: string;
	source?: ServiceSourceProps;
	deploy?: ServiceDeployProps;
	databases?: ServiceDatabaseLink[];
	variables?: RailwayVariables;
};

export type ServiceSourceProps =
	| {
			image: string;
			repo?: never;
			branch?: never;
	  }
	| {
			repo: `${string}/${string}`;
			branch?: string;
			image?: never;
	  };

export type ServiceDatabaseLink =
	| string
	| {
			name: string;
			variables?: Record<string, string>;
	  };

export class Service {
	constructor(private props: ServiceProps) {}

	public get name(): string {
		return this.props.name;
	}

	public get source(): ServiceSourceProps | undefined {
		return this.props.source;
	}

	public getVariablePromptRequests(): RailwayVariablePromptRequest[] {
		if (!this.props.variables) {
			return [];
		}

		const requests: RailwayVariablePromptRequest[] = [];

		for (const [name, value] of Object.entries(this.props.variables)) {
			if (isPromptVariable(value)) {
				requests.push({
					name,
					scope: "service",
					serviceName: this.name,
					prompt: value,
				});
			}
		}

		return requests;
	}

	public async resolveVariables(
		resolve: RailwayVariableResolver,
	): Promise<Service> {
		const variables = await this.resolveVariableMap(resolve);

		return new Service({
			...this.props,
			variables,
		});
	}

	public toRailwayPatch(context: RailwayPatchContext): RailwayConfigPatch {
		const service = this.findService(context);
		const patch: RailwayConfigPatch = {};

		const variables = this.buildVariables(context);

		if (Object.keys(variables).length > 0) {
			patch.variables = formatVariables(variables);
		}

		if (this.props.deploy) {
			patch.deploy = this.buildDeployPatch();
		}

		if (Object.keys(patch).length === 0) {
			return {};
		}

		return {
			[service.id]: patch,
		};
	}

	private buildVariables(context: RailwayPatchContext): RailwayVariables {
		return {
			...this.buildDatabaseVariables(context),
			...(this.props.variables ?? {}),
		};
	}

	private buildDatabaseVariables(
		context: RailwayPatchContext,
	): RailwayVariables {
		const variables: RailwayVariables = {};

		for (const link of this.props.databases ?? []) {
			const databaseName = getDatabaseLinkName(link);
			const database = this.findDatabase(context, databaseName);
			const mappings = getDatabaseVariableMappings(link, database);

			for (const [targetName, sourceName] of Object.entries(mappings)) {
				variables[targetName] = referenceVariable(database.name, sourceName);
			}
		}

		return variables;
	}

	private findService(context: RailwayPatchContext) {
		const service = context.services.find((item) => item.name === this.name);

		if (!service) {
			const availableServices = context.services
				.map((item) => item.name)
				.join(", ");

			throw new Error(
				`Railway service "${this.name}" was not found. Available services: ${availableServices}`,
			);
		}

		return service;
	}

	private findDatabase(
		context: RailwayPatchContext,
		name: string,
	): RailwayDatabaseRef {
		const database = context.databases?.find((item) => item.name === name);

		if (!database) {
			const availableDatabases = (context.databases ?? [])
				.map((item) => item.name)
				.join(", ");

			throw new Error(
				`Railway database "${name}" was not found. Available databases: ${availableDatabases}`,
			);
		}

		return database;
	}

	private buildDeployPatch(): RailwayConfigPatch {
		const deploy: RailwayConfigPatch = {};

		if (!this.props.deploy) {
			return deploy;
		}

		for (const [name, value] of Object.entries(this.props.deploy)) {
			if (value !== undefined) {
				deploy[name] = value;
			}
		}

		return deploy;
	}

	private async resolveVariableMap(
		resolve: RailwayVariableResolver,
	): Promise<ResolvedRailwayVariables | undefined> {
		if (!this.props.variables) {
			return undefined;
		}

		const variables: ResolvedRailwayVariables = {};

		for (const [name, value] of Object.entries(this.props.variables)) {
			if (isPromptVariable(value)) {
				const resolved = await resolve({
					name,
					scope: "service",
					serviceName: this.name,
					prompt: value,
				});

				if (resolved !== undefined) {
					variables[name] = resolved;
				}

				continue;
			}

			variables[name] = value;
		}

		if (Object.keys(variables).length === 0) {
			return undefined;
		}

		return variables;
	}
}

function getDatabaseLinkName(link: ServiceDatabaseLink): string {
	if (typeof link === "string") {
		return link;
	}

	return link.name;
}

function getDatabaseVariableMappings(
	link: ServiceDatabaseLink,
	database: RailwayDatabaseRef,
): Record<string, string> {
	if (typeof link !== "string" && link.variables) {
		return link.variables;
	}

	return getDefaultDatabaseVariableMappings(database);
}

function getDefaultDatabaseVariableMappings(
	database: RailwayDatabaseRef,
): Record<string, string> {
	if (database.type === "postgresql") {
		return mapVariables([
			"PGHOST",
			"PGPORT",
			"PGUSER",
			"PGPASSWORD",
			"PGDATABASE",
			"DATABASE_URL",
		]);
	}

	if (database.type === "mysql") {
		return mapVariables([
			"MYSQLHOST",
			"MYSQLPORT",
			"MYSQLUSER",
			"MYSQLPASSWORD",
			"MYSQLDATABASE",
			"MYSQL_URL",
		]);
	}

	if (database.type === "mongodb") {
		return mapVariables([
			"MONGOHOST",
			"MONGOPORT",
			"MONGOUSER",
			"MONGOPASSWORD",
			"MONGO_URL",
		]);
	}

	if (database.type === "redis") {
		return mapVariables([
			"REDISHOST",
			"REDISUSER",
			"REDISPORT",
			"REDISPASSWORD",
			"REDIS_URL",
		]);
	}

	return {
		DATABASE_URL: "DATABASE_URL",
	};
}

function mapVariables(names: string[]): Record<string, string> {
	return Object.fromEntries(names.map((name) => [name, name]));
}

function referenceVariable(
	serviceName: string,
	variableName: string,
): RailwayVariableValue {
	return `\${{${serviceName}.${variableName}}}`;
}
