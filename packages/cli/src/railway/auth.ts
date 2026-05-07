import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export class RailwayAuthError extends Error {
	override name = "RailwayAuthError";
}

type RailwayLocalAuthConfig = {
	user?: {
		token?: unknown;
		accessToken?: unknown;
		refreshToken?: unknown;
		tokenExpiresAt?: unknown;
	};
};

type RailwayAuthHeaders = Record<string, string>;

const railwayAuthRefreshTimeoutMs = 30_000;

export async function getRailwayAuthHeaders(options: {
	token?: string;
	headers?: Record<string, string>;
}): Promise<RailwayAuthHeaders> {
	const authHeaders = await getRailwayAuthHeader(options.token);

	return {
		...authHeaders,
		...options.headers,
	};
}

export function getRailwayAuthHelp(): string {
	return [
		"Railform uses Railway authentication from RAILWAY_API_TOKEN, RAILWAY_TOKEN, or an existing local Railway session.",
		"Refresh your Railway authentication, then run this command again.",
	].join("\n");
}

async function getRailwayAuthHeader(
	explicitToken: string | undefined,
): Promise<RailwayAuthHeaders> {
	const token = getNonEmptyString(explicitToken);

	if (token) {
		return {
			Authorization: `Bearer ${token}`,
		};
	}

	const projectToken = getNonEmptyString(process.env.RAILWAY_TOKEN);

	if (projectToken) {
		return {
			"project-access-token": projectToken,
		};
	}

	const apiToken = getNonEmptyString(process.env.RAILWAY_API_TOKEN);

	if (apiToken) {
		return {
			Authorization: `Bearer ${apiToken}`,
		};
	}

	const railwayLoginToken = await getRailwayLocalLoginToken();

	if (railwayLoginToken) {
		return {
			Authorization: `Bearer ${railwayLoginToken}`,
		};
	}

	throw new RailwayAuthError(getRailwayAuthHelp());
}

async function getRailwayLocalLoginToken(): Promise<string | undefined> {
	const configPath = getRailwayLocalAuthConfigPath();
	const config = await readRailwayLocalAuthConfig(configPath);

	if (!config) {
		return undefined;
	}

	const accessToken = getNonEmptyString(config.user?.accessToken);

	if (accessToken) {
		if (tokenIsExpired(config.user?.tokenExpiresAt)) {
			await refreshRailwayLocalLogin();
			const refreshedConfig = await readRailwayLocalAuthConfig(configPath);
			const refreshedAccessToken = getNonEmptyString(
				refreshedConfig?.user?.accessToken,
			);

			return refreshedAccessToken ?? accessToken;
		}

		return accessToken;
	}

	return getNonEmptyString(config.user?.token);
}

function getRailwayLocalAuthConfigPath(): string {
	const fileName = getRailwayLocalAuthConfigFileName();

	return join(homedir(), ".railway", fileName);
}

function getRailwayLocalAuthConfigFileName(): string {
	switch (process.env.RAILWAY_ENV?.toLowerCase()) {
		case "staging":
			return "config-staging.json";
		case "dev":
		case "develop":
			return "config-dev.json";
		default:
			return "config.json";
	}
}

async function readRailwayLocalAuthConfig(
	path: string,
): Promise<RailwayLocalAuthConfig | undefined> {
	if (!existsSync(path)) {
		return undefined;
	}

	try {
		return JSON.parse(await readFile(path, "utf8")) as RailwayLocalAuthConfig;
	} catch {
		return undefined;
	}
}

function tokenIsExpired(tokenExpiresAt: unknown): boolean {
	if (typeof tokenExpiresAt !== "number") {
		return false;
	}

	const nowSeconds = Math.floor(Date.now() / 1000);

	return nowSeconds >= tokenExpiresAt - 60;
}

async function refreshRailwayLocalLogin(): Promise<void> {
	try {
		await execRailwayWhoami();
	} catch {
		throw new RailwayAuthError(
			[
				"Your Railway authentication appears to be expired, and Railform could not refresh it.",
				getRailwayAuthHelp(),
			].join("\n"),
		);
	}
}

async function execRailwayWhoami(): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		execFile(
			"railway",
			["whoami", "--json"],
			{ timeout: railwayAuthRefreshTimeoutMs },
			(error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			},
		);
	});
}

function getNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();

	return trimmed.length > 0 ? trimmed : undefined;
}
