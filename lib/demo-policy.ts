/** A UID match can only restrict live capabilities; an email never grants demo or staff access. */
export function matchesDemoPrincipal(userId: string | undefined, project: string | undefined, uid: string | undefined) {
  return !!userId && !!project && !!uid && userId === `firebase:${project}:${uid}`;
}
