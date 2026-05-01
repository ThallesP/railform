import type { AnyVariables } from "@urql/core";
import { cacheExchange, createClient, fetchExchange } from "@urql/core";
import type { TadaDocumentNode } from "gql.tada";
import { graphql } from "gql.tada";

export { graphql };

export const RAILWAY_GRAPHQL_ENDPOINT =
  "https://backboard.railway.com/graphql/v2";

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
    url: options.endpoint ?? RAILWAY_GRAPHQL_ENDPOINT,
    exchanges: [cacheExchange, fetchExchange],
    preferGetMethod: false,
    fetchOptions: () => ({
      headers: getRailwayGraphQLHeaders(options),
    }),
  });
}

export const railwayGraphQLClient = createRailwayGraphQLClient();

export async function requestRailway<
  Result,
  DocumentVariables extends AnyVariables,
>(
  document: TadaDocumentNode<Result, DocumentVariables>,
  variables: DocumentVariables,
  options?: RailwayGraphQLClientOptions,
): Promise<Result> {
  const client = options
    ? createRailwayGraphQLClient(options)
    : railwayGraphQLClient;
  const result = await client.query(document, variables).toPromise();

  if (result.error) {
    throw result.error;
  }

  if (!result.data) {
    throw new Error("Railway GraphQL response did not include data");
  }

  return result.data;
}

function getRailwayGraphQLHeaders(options: RailwayGraphQLClientOptions) {
  const token = options.token ?? process.env.RAILWAY_API_TOKEN;

  if (!token) {
    throw new Error("Missing RAILWAY_API_TOKEN environment variable");
  }

  return {
    Authorization: `Bearer ${token}`,
    ...options.headers,
  };
}
