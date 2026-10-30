// The owner of the site: the account id (UID) that can do everything on the Control page.
// Everyone else only gets what the owner switches on for them (Control -> Permissions).
// The same id is also written in firestore.rules, because the rules are the real lock.
export const ADMIN_UIDS = ['sgwJTqVeQxa1JBCjLqgKSNYZcNj2'];
