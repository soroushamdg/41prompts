/** The avatar letter: the name's first letter, or the email's for magic-link users. */
export function initialFor(name: string, email: string): string {
  return (name.trim() || email.trim() || "?").charAt(0).toUpperCase();
}
