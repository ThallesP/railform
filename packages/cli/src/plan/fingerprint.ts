import type { RailwayPatchValue } from "@railform/core";

export async function fingerprintPatch(
	value: RailwayPatchValue,
): Promise<string> {
	const json = stableJson(value);
	const bytes = new TextEncoder().encode(json);
	const hash = await crypto.subtle.digest("SHA-256", bytes);
	const parts = Array.from(new Uint8Array(hash));
	const hex = parts.map((part) => part.toString(16).padStart(2, "0")).join("");

	return `sha256:${hex}`;
}

export function getPatchShapeFingerprint(value: RailwayPatchValue): string {
	return stableJson(toPatchShape(value));
}

export function stableJson(value: RailwayPatchValue): string {
	if (value === null) {
		return "null";
	}

	if (Array.isArray(value)) {
		const items = value.map((item) => stableJson(item));
		return `[${items.join(",")}]`;
	}

	if (isRecord(value)) {
		const keys = Object.keys(value).sort();
		const items = keys.map((key) => {
			return `${JSON.stringify(key)}:${stableJson(value[key] ?? null)}`;
		});

		return `{${items.join(",")}}`;
	}

	return JSON.stringify(value);
}

function toPatchShape(value: RailwayPatchValue): RailwayPatchValue {
	if (Array.isArray(value)) {
		return value.map((item) => toPatchShape(item));
	}

	if (isRecord(value)) {
		const shape: Record<string, RailwayPatchValue> = {};

		for (const [key, child] of Object.entries(value)) {
			shape[key] = toPatchShape(child);
		}

		return shape;
	}

	return true;
}

function isRecord(
	value: RailwayPatchValue,
): value is Record<string, RailwayPatchValue> {
	if (value === null) {
		return false;
	}

	if (Array.isArray(value)) {
		return false;
	}

	return typeof value === "object";
}
