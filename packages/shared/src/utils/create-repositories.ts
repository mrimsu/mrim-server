import { createPool } from "mysql2/promise";
import { UserRepository } from "../repositories/user.js";
import { ContactGroupRepository } from "../repositories/contact-group.js";

interface Repositories {
  userRepository: UserRepository;
  contactGroupRepository: ContactGroupRepository;
}

export function createRepositories(connectionUri: string): Repositories {
  const pool = createPool(connectionUri);

  return {
    userRepository: new UserRepository(pool),
    contactGroupRepository: new ContactGroupRepository(pool),
  };
}
