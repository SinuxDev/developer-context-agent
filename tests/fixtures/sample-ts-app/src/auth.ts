export interface User {
  id: string;
  email: string;
}

export function validateEmail(email: string): boolean {
  return email.includes('@');
}

export function createUser(email: string): User {
  if (!validateEmail(email)) {
    throw new Error('Invalid email');
  }
  return { id: crypto.randomUUID(), email };
}
