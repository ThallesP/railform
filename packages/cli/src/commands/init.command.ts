import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defineCommand } from "@bunli/core";
import { getRailwayAuthHelp, RailwayAuthError } from "../railway/auth";
import { resolveWorkspaceId } from "../railway/project";
import { getCurrentUser } from "../railway/queries/current-user";

const configFile = "railform.config.ts";
const agentsFile = "AGENTS.md";
const bundledSkillPath =
	"node_modules/@railform/core/agent-skills/railway-stack/SKILL.md";

export default defineCommand({
	name: "init",
	description: "Create a basic Railform project",
	handler: async ({ cwd }) => {
		const user = await assertRailwayLogin();
		const workspaceId = await resolveWorkspaceId({
			context: "new Railform projects",
		});
		const created: string[] = [];
		const skipped: string[] = [];

		await writeIfMissing(
			join(cwd, configFile),
			getConfigTemplate(workspaceId),
			{
				created,
				skipped,
				label: configFile,
			},
		);
		await writeIfMissing(join(cwd, agentsFile), getAgentsTemplate(), {
			created,
			skipped,
			label: agentsFile,
		});

		if (created.length > 0) {
			console.log(`Created ${created.join(", ")}`);
		}

		if (skipped.length > 0) {
			console.log(`Skipped existing ${skipped.join(", ")}`);
		}

		console.log("");
		console.log(`Railway login: ${formatUser(user.me)}`);
		console.log("No Railway resources were created or changed.");
		console.log("");
		console.log("Next steps:");
		console.log(`  1. Read ${bundledSkillPath}.`);
		console.log("  2. Edit railform.config.ts for your Railway project.");
		console.log("  3. Run railform plan to preview changes.");
		console.log(
			"  4. Run railform apply --request-approval for agent-safe apply.",
		);
	},
});

async function assertRailwayLogin(): Promise<
	Awaited<ReturnType<typeof getCurrentUser>>
> {
	try {
		return await getCurrentUser();
	} catch (error) {
		if (error instanceof RailwayAuthError) {
			throw error;
		}

		throw new Error(
			[
				"Railform could not verify your Railway authentication.",
				getRailwayAuthHelp(),
				"",
				`Details: ${getErrorMessage(error)}`,
			].join("\n"),
		);
	}
}

function formatUser(user: {
	email?: string | null;
	name?: string | null;
	username?: string | null;
}): string {
	return user.email ?? user.username ?? user.name ?? "authenticated";
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

async function writeIfMissing(
	path: string,
	contents: string,
	options: {
		created: string[];
		skipped: string[];
		label: string;
	},
): Promise<void> {
	if (existsSync(path)) {
		options.skipped.push(options.label);
		return;
	}

	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, contents);
	options.created.push(options.label);
}

function getConfigTemplate(workspaceId: string): string {
	return `// Agents: start at ${bundledSkillPath}.
import {
	Postgres,
	Project,
	Service,
	promptVariable,
	randomSecret,
	railwayPrivateUrl,
} from "@railform/core";

export default new Project({
	name: "My Railway Project",
	workspaceId: "${workspaceId}",
	environment: "production",
	sharedVariables: {
		NODE_ENV: "production",
	},
	databases: [
		new Postgres({
			name: "postgres",
		}),
	],
	services: [
		new Service({
			name: "web",
			databases: ["postgres"],
			variables: {
				API_TOKEN: promptVariable("API token"),
				SESSION_SECRET: randomSecret(48),
				INTERNAL_API_URL: railwayPrivateUrl("web"),
			},
			deploy: {
				startCommand: "bun run start",
			},
		}),
	],
});
`;
}

function getAgentsTemplate(): string {
	return `# Agent Notes

Start with:

\`\`\`text
${bundledSkillPath}
\`\`\`

Use \`railform plan\` for read-only preview. For agent-safe mutation, use
\`railform apply --request-approval --format json\`, tell the human to review
and approve, then continue with \`railform apply --approval <approval-id> --wait
--format json\`.
`;
}
