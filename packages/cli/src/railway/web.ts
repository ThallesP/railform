import type { RailwayEnvironment, RailwayProject } from "./project";

export function getRailwayProjectUrl(
	project: RailwayProject,
	environment: RailwayEnvironment,
): string {
	const url = new URL(`https://railway.com/project/${project.id}`);
	url.searchParams.set("environmentId", environment.id);

	return url.toString();
}

export async function openRailwayProject(options: {
	project: RailwayProject;
	environment: RailwayEnvironment;
}): Promise<void> {
	const url = getRailwayProjectUrl(options.project, options.environment);
	const opened = await openUrl(url);

	if (opened) {
		console.log(`Opened Railway: ${url}`);
		return;
	}

	console.log(`Railway: ${url}`);
}

async function openUrl(url: string): Promise<boolean> {
	const command = getOpenCommand(url);

	if (!command) {
		return false;
	}

	try {
		const process = Bun.spawn(command, {
			stdout: "ignore",
			stderr: "ignore",
		});
		const exitCode = await process.exited;

		return exitCode === 0;
	} catch {
		return false;
	}
}

function getOpenCommand(url: string): string[] | undefined {
	if (process.platform === "darwin") {
		return ["open", url];
	}

	if (process.platform === "win32") {
		return ["cmd", "/c", "start", "", url];
	}

	if (process.platform === "linux") {
		return ["xdg-open", url];
	}

	return undefined;
}
