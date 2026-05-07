import type { AnyVariables } from "@urql/core";
import { cacheExchange, createClient, fetchExchange } from "@urql/core";
import type { TadaDocumentNode } from "gql.tada";
import { graphql } from "gql.tada";
import { getRailwayAuthHeaders } from "./auth";

export { graphql };

export const RAILWAY_GRAPHQL_ENDPOINT = getRailwayGraphQLEndpoint();

export type RailwayGraphQLClientOptions = {
	endpoint?: string;
	token?: string;
	headers?: Record<string, string>;
};

export type RailwayGraphQLDocument<
	Result = unknown,
	DocumentVariables extends AnyVariables = AnyVariables,
> = TadaDocumentNode<Result, DocumentVariables>;

export function createRailwayGraphQLClient(
	options: RailwayGraphQLClientOptions = {},
) {
	return createClient({
		url: options.endpoint ?? getRailwayGraphQLEndpoint(),
		exchanges: [cacheExchange, fetchExchange],
		preferGetMethod: false,
		fetchOptions: () => ({
			headers: options.headers,
		}),
	});
}

export async function requestRailway<
	Result,
	DocumentVariables extends AnyVariables,
>(
	document: TadaDocumentNode<Result, DocumentVariables>,
	variables: DocumentVariables,
	options?: RailwayGraphQLClientOptions,
): Promise<Result> {
	const client = createRailwayGraphQLClient({
		...options,
		headers: await getRailwayAuthHeaders(options ?? {}),
	});
	const result = await client.query(document, variables).toPromise();

	if (result.error) {
		throw result.error;
	}

	if (!result.data) {
		throw new Error("Railway GraphQL response did not include data");
	}

	return result.data;
}

export async function mutateRailway<
	Result,
	DocumentVariables extends AnyVariables,
>(
	document: TadaDocumentNode<Result, DocumentVariables>,
	variables: DocumentVariables,
	options?: RailwayGraphQLClientOptions,
): Promise<Result> {
	const client = createRailwayGraphQLClient({
		...options,
		headers: await getRailwayAuthHeaders(options ?? {}),
	});
	const result = await client.mutation(document, variables).toPromise();

	if (result.error) {
		throw result.error;
	}

	if (!result.data) {
		throw new Error("Railway GraphQL response did not include data");
	}

	return result.data;
}

function getRailwayGraphQLEndpoint(): string {
	switch (process.env.RAILWAY_ENV?.toLowerCase()) {
		case "staging":
			return "https://backboard.railway-staging.com/graphql/v2";
		case "dev":
		case "develop":
			return "https://backboard.railway-develop.com/graphql/v2";
		default:
			return "https://backboard.railway.com/graphql/v2";
	}
}
