import { graphql, requestRailway } from "../client";

export const CurrentUserQuery = graphql(`
	query CurrentUser {
		me {
			id
			email
			name
			username
		}
	}
`);

export function getCurrentUser() {
	return requestRailway(CurrentUserQuery, {});
}
