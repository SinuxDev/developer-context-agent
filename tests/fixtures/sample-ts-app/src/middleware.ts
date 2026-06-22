import type { User } from './auth.js';
import { createUser } from './auth.js';

const users = new Map<string, User>();

export function registerUser(email: string): User {
  const user = createUser(email);
  users.set(user.id, user);
  return user;
}

export function getUser(id: string): User | undefined {
  return users.get(id);
}

export function authMiddleware(token: string): User | null {
  if (!token) return null;
  const user = users.get(token);
  return user ?? null;
}
