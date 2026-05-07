import { defineCommand } from "@bunli/core";
import { rejectRailformApproval } from "../approval";

export default defineCommand({
	name: "reject",
	description: "Reject a Railform approval request",
	handler: async ({ cwd, positional, format, output }) => {
		const approvalId = getApprovalId(positional, "reject");
		const approval = await rejectRailformApproval(cwd, approvalId);

		if (format !== "toon") {
			output({
				ok: true,
				data: {
					status: approval.status,
					approvalId: approval.id,
				},
			});
			return;
		}

		console.log(`Rejected ${approval.id}`);
	},
});

function getApprovalId(positional: string[], command: string): string {
	const approvalId = positional[0];

	if (!approvalId) {
		throw new Error(`Usage: railform ${command} <approval-id>`);
	}

	return approvalId;
}
