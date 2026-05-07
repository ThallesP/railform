import { Elysia, t } from "elysia";

type NoteRow = {
	id: number;
	body: string;
	created_at: Date;
};

const port = Number(process.env.PORT ?? "3000");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error("DATABASE_URL is required");
}

const sql = new Bun.SQL(databaseUrl);

await sql`
	create table if not exists notes (
		id serial primary key,
		body text not null,
		created_at timestamptz not null default now()
	)
`;

const app = new Elysia()
	.get("/", () => ({
		name: "railform-video-demo",
		routes: ["GET /health", "GET /notes", "POST /notes"],
	}))
	.get("/health", async () => {
		await sql`select 1`;

		return { ok: true };
	})
	.get("/notes", async () => {
		const notes = await sql<NoteRow[]>`
			select id, body, created_at
			from notes
			order by id desc
			limit 20
		`;

		return { notes };
	})
	.post(
		"/notes",
		async ({ body, set }) => {
			const [note] = await sql<NoteRow[]>`
				insert into notes (body)
				values (${body.body})
				returning id, body, created_at
			`;

			set.status = 201;

			return { note };
		},
		{
			body: t.Object({
				body: t.String({ minLength: 1, maxLength: 240 }),
			}),
		},
	)
	.listen(port);

console.log(`railform video demo listening on ${app.server?.url}`);
