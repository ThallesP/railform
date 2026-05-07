import { defineCommand } from "@bunli/core";
import { approveRailformApproval } from "../approval";

export default defineCommand({
	name: "approve",
	description: "Approve a Railform approval request",
	handler: async ({ cwd, positional, format, output }) => {
		const approvalId = getApprovalId(positional, "approve");
		const approval = await approveRailformApproval(cwd, approvalId);

		if (format !== "toon") {
			output({
				ok: true,
				data: {
					status: approval.status,
					approvalId: approval.id,
					continueCommand: `railform apply --approval ${approval.id} --wait --format json`,
				},
			});
			return;
		}

		console.log(`Approved ${approval.id}`);
		console.log(
			`Agent can continue with: railform apply --approval ${approval.id} --wait`,
		);
	},
});

function getApprovalId(positional: string[], command: string): string {
	const approvalId = positional[0];

	if (!approvalId) {
		throw new Error(`Usage: railform ${command} <approval-id>`);
	}

	return approvalId;
}
