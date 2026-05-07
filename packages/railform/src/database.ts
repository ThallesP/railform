export type DatabaseType = "postgresql" | "mysql" | "mongodb" | "redis";

export type DatabaseProps = {
	name: string;
};

export interface Database {
	readonly name: string;
	readonly type: DatabaseType;
}

abstract class RailwayDatabase implements Database {
	constructor(private props: DatabaseProps) {}

	protected abstract databaseType: DatabaseType;

	public get name(): string {
		return this.props.name;
	}

	public get type(): DatabaseType {
		return this.databaseType;
	}
}

export class Postgres extends RailwayDatabase {
	protected databaseType = "postgresql" as const;
}

export class MySQL extends RailwayDatabase {
	protected databaseType = "mysql" as const;
}

export class MongoDB extends RailwayDatabase {
	protected databaseType = "mongodb" as const;
}

export class Redis extends RailwayDatabase {
	protected databaseType = "redis" as const;
}
