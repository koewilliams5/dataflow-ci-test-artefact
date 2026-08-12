import type { PrismaClient, User } from "@prisma/client";
import { prisma as defaultClient } from "../client";

export interface CreateUserInput {
  email: string;
  passwordHash: string;
}

export async function createUser(
  input: CreateUserInput,
  client: PrismaClient = defaultClient,
): Promise<User> {
  return client.user.create({ data: input });
}

export async function findUserByEmail(
  email: string,
  client: PrismaClient = defaultClient,
): Promise<User | null> {
  return client.user.findUnique({ where: { email } });
}

export async function findUserById(
  id: string,
  client: PrismaClient = defaultClient,
): Promise<User | null> {
  return client.user.findUnique({ where: { id } });
}
