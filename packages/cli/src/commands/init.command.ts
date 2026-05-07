import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defineCommand } from "@bunli/core";
import { getRailwayAuthHelp, RailwayAuthError } from "../railway/auth";
import { resolveWorkspaceId } from "../railway/project";
import { getCurrentUser } from "../railway/queries/current-user";
import {
	getSavedWorkspaceId,
	readRailformState,
	saveWorkspaceId,
} from "../state";

const configFile = "railform.config.ts";
const agentsFile = "AGENTS.md";
const railformCorePackage = "@railform/core";
const bundledSkillPath =
	"node_modules/@railform/core/agent-skills/railway-stack/SKILL.md";

export default defineCommand({
	name: "init",
	description: "Create a basic Railform project",
	handler: async ({ cwd }) => {
		const user = await assertRailwayLogin();
		const state = await readRailformState(cwd);
		const workspaceId = await resolveWorkspaceId({
			savedWorkspaceId: getSavedWorkspaceId(state),
			context: "new Railform projects",
		});
		const created: string[] = [];
		const skipped: string[] = [];
		const packageInfo = await getPackageInfo(cwd);
		const source = await inferGitSource(cwd);

		await saveWorkspaceId(cwd, workspaceId);
		await installRailformCore(cwd, packageInfo);
		await writeIfMissing(
			join(cwd, configFile),
			getConfigTemplate({
				source,
				startCommand: getStartCommand(packageInfo),
			}),
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
		console.log("Railway workspace saved to .railform/state.json.");
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

type PackageInfo = {
	manager: PackageManager;
	dependencies: Record<string, string>;
	devDependencies: Record<string, string>;
	optionalDependencies: Record<string, string>;
	peerDependencies: Record<string, string>;
	scripts: Record<string, string>;
};

type PackageManager = "bun" | "npm" | "pnpm" | "yarn";

type GitSource = {
	repo: `${string}/${string}`;
	branch?: string;
};

async function getPackageInfo(cwd: string): Promise<PackageInfo | undefined> {
	const packageJsonPath = join(cwd, "package.json");

	if (!existsSync(packageJsonPath)) {
		return undefined;
	}

	const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

	return {
		manager: detectPackageManager(cwd, packageJson.packageManager),
		dependencies: getPackageRecord(packageJson.dependencies),
		devDependencies: getPackageRecord(packageJson.devDependencies),
		optionalDependencies: getPackageRecord(packageJson.optionalDependencies),
		peerDependencies: getPackageRecord(packageJson.peerDependencies),
		scripts: getPackageRecord(packageJson.scripts),
	};
}

function detectPackageManager(
	cwd: string,
	packageManager: unknown,
): PackageManager {
	if (typeof packageManager === "string") {
		const [name] = packageManager.split("@");

		if (name && isPackageManager(name)) {
			return name;
		}
	}

	if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) {
		return "bun";
	}

	if (existsSync(join(cwd, "pnpm-lock.yaml"))) {
		return "pnpm";
	}

	if (existsSync(join(cwd, "yarn.lock"))) {
		return "yarn";
	}

	return "npm";
}

function isPackageManager(value: string): value is PackageManager {
	return (
		value === "bun" || value === "npm" || value === "pnpm" || value === "yarn"
	);
}

function getPackageRecord(value: unknown): Record<string, string> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}

	const result: Record<string, string> = {};

	for (const [key, item] of Object.entries(value)) {
		if (typeof item === "string") {
			result[key] = item;
		}
	}

	return result;
}

async function installRailformCore(
	cwd: string,
	packageInfo: PackageInfo | undefined,
): Promise<void> {
	if (!packageInfo) {
		console.log(
			`No package.json found; run npm init -y and npm install -D ${railformCorePackage} before railform plan.`,
		);
		return;
	}

	if (packageHasDependency(packageInfo, railformCorePackage)) {
		return;
	}

	const command = getInstallCommand(packageInfo.manager);

	console.log(
		`Installing ${railformCorePackage} with ${packageInfo.manager} so railform plan can load railform.config.ts...`,
	);

	await runCommand(command[0], [...command.slice(1), railformCorePackage], cwd);
}

function packageHasDependency(packageInfo: PackageInfo, name: string): boolean {
	return (
		name in packageInfo.dependencies ||
		name in packageInfo.devDependencies ||
		name in packageInfo.optionalDependencies ||
		name in packageInfo.peerDependencies
	);
}

function getInstallCommand(manager: PackageManager): [string, ...string[]] {
	if (manager === "bun") {
		return ["bun", "add", "-d"];
	}

	if (manager === "pnpm") {
		return ["pnpm", "add", "-D"];
	}

	if (manager === "yarn") {
		return ["yarn", "add", "-D"];
	}

	return ["npm", "install", "-D"];
}

function getStartCommand(packageInfo: PackageInfo | undefined): string {
	const manager = packageInfo?.manager ?? "npm";
	const scripts = packageInfo?.scripts ?? {};

	for (const scriptName of ["start", "start:prod", "serve"]) {
		if (scriptName in scripts) {
			return `${manager} run ${scriptName}`;
		}
	}

	return `${manager} run start`;
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

async function inferGitSource(cwd: string): Promise<GitSource | undefined> {
	const remote = await runCommandCapture(
		"git",
		["remote", "get-url", "origin"],
		cwd,
	);
	const repo = parseGitHubRepo(remote.trim());

	if (!repo) {
		return undefined;
	}

	const branch = (
		await runCommandCapture("git", ["branch", "--show-current"], cwd)
	).trim();

	return {
		repo,
		...(branch ? { branch } : {}),
	};
}

function parseGitHubRepo(remote: string): GitSource["repo"] | undefined {
	const match = remote.match(
		/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+)\/(.+?)(?:\.git)?$/,
	);

	if (!match?.[1] || !match[2]) {
		return undefined;
	}

	return `${match[1]}/${match[2]}` as GitSource["repo"];
}

async function runCommand(
	command: string,
	args: string[],
	cwd: string,
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			stdio: "inherit",
		});

		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
		});
	});
}

async function runCommandCapture(
	command: string,
	args: string[],
	cwd: string,
): Promise<string> {
	return await new Promise<string>((resolve) => {
		const child = spawn(command, args, {
			cwd,
			stdio: ["ignore", "pipe", "ignore"],
		});
		const output: string[] = [];

		child.stdout?.on("data", (chunk) => {
			output.push(String(chunk));
		});
		child.on("error", () => {
			resolve("");
		});
		child.on("close", (code) => {
			resolve(code === 0 ? output.join("") : "");
		});
	});
}

function getConfigTemplate(options: {
	source: GitSource | undefined;
	startCommand: string;
}): string {
	const sourceBlock = options.source
		? [
				"\t\t\tsource: {",
				`\t\t\t\trepo: ${JSON.stringify(options.source.repo)},`,
				...(options.source.branch
					? [`\t\t\t\tbranch: ${JSON.stringify(options.source.branch)},`]
					: []),
				"\t\t\t},",
			].join("\n")
		: "";
	const sourceLines = sourceBlock ? `${sourceBlock}\n` : "";

	return `// Agents: start at ${bundledSkillPath}.
import {
	Postgres,
	Project,
	Service,
} from "@railform/core";

export default new Project({
	name: "My Railway Project",
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
${sourceLines}\t\t\tdatabases: ["postgres"],
			variables: {
				NODE_ENV: "production",
			},
			deploy: {
				startCommand: ${JSON.stringify(options.startCommand)},
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
