import { createPool } from "mysql2/promise";
import { UserRepository } from "../repositories/user.js";

interface Repositories {
  userRepository: UserRepository
}

export function createRepositories(connectionUri: string): Repositories {
  const pool = createPool(connectionUri);
  return { userRepository: new UserRepository(pool) };
}
