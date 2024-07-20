import { FieldPacket, RowDataPacket } from "mysql2";
import { Repository } from "./base.js";
import { User } from "./user.js";

interface ContactGroup {
  id: number
  user_id: number
  name: string
  idx: number
  contacts?: unknown[]
}

export class ContactGroupRepository extends Repository {
  async fetchAllWithOwner (owner: User, populateContacts = true): Promise<ContactGroup[]> {
    const connection = await this.pool.getConnection()

    let [contactGroups, ] = await connection.query<RowDataPacket[]>(
      `
      SELECT *
      FROM \`contact_group\`
      WHERE \`contact_group\`.\`user_id\` = ?
      ORDER BY \`contact_group\`.\`idx\` ASC
      `,
      [owner.id]
    ) as [ContactGroup[], FieldPacket[]]

    if (populateContacts) {
      const contacts = await Promise.all(
        contactGroups.map(
          (contactGroup) =>
            connection.query<RowDataPacket[]>(
              `
              SELECT *
              FROM \`contact\`
              WHERE (\`contact\`.\`adder_user_id\` = ? AND
                     \`contact\`.\`adder_group_id\` = ?) OR
                    (\`contact\`.\`contact_user_id\` = ? AND
                     \`contact\`.\`contact_group_id\` = ?)
              `,
              [
                contactGroup.user_id, contactGroup.id,
                contactGroup.user_id, contactGroup.id,
              ],
            )
        )
      )

      contactGroups = contactGroups.map(
        (contactGroup, arrayIndex): ContactGroup =>
          ({ ...contactGroup, contacts: contacts[arrayIndex][0] })
      )
    }

    this.pool.releaseConnection(connection)
    return contactGroups
  }

  private async countGroupsWithOwner (owner: User): Promise<number> {
    const connection = await this.pool.getConnection()
    const [results, ] = await connection.query<RowDataPacket[]>(
      `
      SELECT COUNT(*) AS \`count\`
      FROM \`contact_group\`
      WHERE \`contact_group\`.\`user_id\` = ?
      `,
      [owner.id],
    )

    this.pool.releaseConnection(connection)
    return results.at(-1)!.count as number
  }

  async createWithOwner (owner: User, name: string): Promise<number> {
    const [connection, index] = await Promise.all([
      this.pool.getConnection(),
      this.countGroupsWithOwner(owner),
    ])

    await connection.execute(
      `
      INSERT
      INTO \`contact_group\`
      (\`contact_group\`.\`user_id\`,
       \`contact_group\`.\`name\`,
       \`contact_group\`.\`idx\`)
      VALUES (?, ?, ?)
      `,
      [owner.id, name, index]
    )
    await connection.commit()

    this.pool.releaseConnection(connection)
    return index
  }

  async modifyName (contactGroup: ContactGroup, newName: string): Promise<ContactGroup> {
    const connection = await this.pool.getConnection()

    await connection.execute(
      `
      UPDATE \`contact_group\`
      SET \`contact_group\`.\`name\` = ?
      WHERE \`contact_group\`.\`id\` = ?
      `,
      [newName, contactGroup.id]
    )
    await connection.commit()

    this.pool.releaseConnection(connection)
    return { ...contactGroup, name: newName }
  }

  async delete (contactGroup: ContactGroup): Promise<void> {
    const connection = await this.pool.getConnection()

    await Promise.all([
      connection.execute(
        `
        DELETE
        FROM \`contact_group\`
        WHERE \`contact_group\`.\`id\` = ?;
        `,
        [contactGroup.id],
      ),
      connection.execute(
        `
        UPDATE \`contact_group\`
        SET \`contact_group\`.\`idx\` = \`contact_group\`.\`idx\` - 1
        WHERE \`contact_group\`.\`user_id\` = ? AND
              \`contact_group\`.\`idx\` > ?;
        `,
        [contactGroup.user_id, contactGroup.idx],
      ),
    ])

    await connection.commit()
    this.pool.releaseConnection(connection)
  }
}
