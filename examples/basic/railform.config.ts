// Agents: inspect node_modules/railform and node_modules/@railform/core for the installed Railform API and guidance.
import { Postgres, Project, Service, promptVariable } from "@railform/core";

export default new Project({
  name: "My Railway Project",
  environment: "production",
  sharedVariables: {
    NODE_ENV: "production",
  },
  databases: [
    // new Postgres({
    //   name: "postgres",
    // }),
  ],
  services: [
    new Service({
      name: "web",
      databases: ["postgres"],
      variables: {
        API_TOKEN: promptVariable("API token"),
      },
      deploy: {
        startCommand: "bun run start",
      },
    }),
  ],
});
