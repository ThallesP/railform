import type { Database } from "./database";
import type { Service } from "./service";
import type {
	RailwayConfigPatch,
	RailwayPatchContext,
	RailwayVariablePromptRequest,
	RailwayVariableResolver,
	RailwayVariables,
	ResolvedRailwayVariables,
} from "./types";
import { formatVariables, isPromptVariable } from "./types";

export type ProjectProps = {
	name: string;
	environment?: string;
	services?: Service[];
	databases?: Database[];
	sharedVariables?: RailwayVariables;
};

export class Project {
	constructor(private props: ProjectProps) {}

	public get name(): string {
		return this.props.name;
	}

	public get environment(): string {
		return this.props.environment ?? "production";
	}

	public get services(): Service[] {
		return this.props.services ?? [];
	}

	public get databases(): Database[] {
		return this.props.databases ?? [];
	}

	public getVariablePromptRequests(): RailwayVariablePromptRequest[] {
		return [
			...this.getSharedVariablePromptRequests(),
			...this.services.flatMap((service) =>
				service.getVariablePromptRequests(),
			),
		];
	}

	public async resolveVariables(
		resolve: RailwayVariableResolver,
	): Promise<Project> {
		const sharedVariables = await this.resolveSharedVariables(resolve);
		const services: Service[] = [];

		for (const service of this.services) {
			services.push(await service.resolveVariables(resolve));
		}

		return new Project({
			...this.props,
			sharedVariables,
			services,
		});
	}

	public toRailwayPatch(context: RailwayPatchContext): RailwayConfigPatch {
		const patch: RailwayConfigPatch = {};
		const sharedVariables = this.props.sharedVariables;

		if (sharedVariables && Object.keys(sharedVariables).length > 0) {
			patch.sharedVariables = formatVariables(sharedVariables);
		}

		const services = this.buildServicePatch(context);

		if (Object.keys(services).length > 0) {
			patch.services = services;
		}

		return patch;
	}

	private buildServicePatch(context: RailwayPatchContext): RailwayConfigPatch {
		const services: RailwayConfigPatch = {};

		for (const service of this.services) {
			Object.assign(services, service.toRailwayPatch(context));
		}

		return services;
	}

	private async resolveSharedVariables(
		resolve: RailwayVariableResolver,
	): Promise<ResolvedRailwayVariables | undefined> {
		const sharedVariables = this.props.sharedVariables;

		if (!sharedVariables) {
			return undefined;
		}

		const variables: ResolvedRailwayVariables = {};

		for (const [name, value] of Object.entries(sharedVariables)) {
			if (isPromptVariable(value)) {
				const resolved = await resolve({
					name,
					scope: "shared",
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

	private getSharedVariablePromptRequests(): RailwayVariablePromptRequest[] {
		const sharedVariables = this.props.sharedVariables;

		if (!sharedVariables) {
			return [];
		}

		const requests: RailwayVariablePromptRequest[] = [];

		for (const [name, value] of Object.entries(sharedVariables)) {
			if (isPromptVariable(value)) {
				requests.push({
					name,
					scope: "shared",
					prompt: value,
				});
			}
		}

		return requests;
	}
}
