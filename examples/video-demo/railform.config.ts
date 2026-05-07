import { Postgres, Project, Service } from "@railform/core";

export default new Project({
	name: "railform-video-demo",
	environment: "production",
	databases: [new Postgres({ name: "postgres" })],
	services: [
		new Service({
			name: "api",
			databases: ["postgres"],
			deploy: {
				startCommand: "bun run start",
				healthcheckPath: "/health",
			},
		}),
	],
});
