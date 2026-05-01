import { graphql, requestRailway } from "../client";

export const GetProjects = graphql(`
  query GetProjects {
    projects {
      edges {
        node {
          name
        }
      }
    }
  }
`);

export async function getProjectByName(name: string) {
  const result = await requestRailway(GetProjects, {});

  return result.projects.edges.find((edge) => edge.node.name === name);
}
