import { defineCommand } from "@bunli/core";
import { getProjectByName } from "../railway/queries/get-projects";

export default defineCommand({
  name: "apply",
  description: "Apply the current configuration to Railway",
  handler: async ({ cwd }) => {
    const { default: config } = await import(`${cwd}/railform.config.ts`);
    const result = await getProjectByName(config.name);
    console.log(result);
  },
});
