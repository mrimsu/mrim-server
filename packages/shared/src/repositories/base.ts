import { Pool } from "mysql2/promise";

export class Repository {
  constructor (protected readonly pool: Pool) {}
}
