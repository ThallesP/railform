const fingerprintPattern = /sha256:[a-f0-9]+/;

export function createPlanMessage(
	projectName: string,
	fingerprint: string,
): string {
	return `railform: update ${projectName} (${fingerprint})`;
}

export function getMessageFingerprint(
	message: string | null,
): string | undefined {
	if (!message) {
		return undefined;
	}

	const match = message.match(fingerprintPattern);

	if (!match) {
		return undefined;
	}

	return match[0];
}
