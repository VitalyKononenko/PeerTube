import { BelongsTo, Column, CreatedAt, ForeignKey, Model, Scopes, Table, UpdatedAt } from 'sequelize-typescript'
import { AccountModel } from './account'
import { getSort, searchAttribute } from '../utils'
import { AccountBlock } from '../../../shared/models/blocklist'
import { Op } from 'sequelize'
import * as Bluebird from 'bluebird'
import { MAccountBlocklist, MAccountBlocklistAccounts, MAccountBlocklistFormattable } from '@server/typings/models'

enum ScopeNames {
  WITH_ACCOUNTS = 'WITH_ACCOUNTS'
}

@Scopes(() => ({
  [ScopeNames.WITH_ACCOUNTS]: {
    include: [
      {
        model: AccountModel,
        required: true,
        as: 'ByAccount'
      },
      {
        model: AccountModel,
        required: true,
        as: 'BlockedAccount'
      }
    ]
  }
}))

@Table({
  tableName: 'accountBlocklist',
  indexes: [
    {
      fields: [ 'accountId', 'targetAccountId' ],
      unique: true
    },
    {
      fields: [ 'targetAccountId' ]
    }
  ]
})
export class AccountBlocklistModel extends Model<AccountBlocklistModel> {

  @CreatedAt
  createdAt: Date

  @UpdatedAt
  updatedAt: Date

  @ForeignKey(() => AccountModel)
  @Column
  accountId: number

  @BelongsTo(() => AccountModel, {
    foreignKey: {
      name: 'accountId',
      allowNull: false
    },
    as: 'ByAccount',
    onDelete: 'CASCADE'
  })
  ByAccount: AccountModel

  @ForeignKey(() => AccountModel)
  @Column
  targetAccountId: number

  @BelongsTo(() => AccountModel, {
    foreignKey: {
      name: 'targetAccountId',
      allowNull: false
    },
    as: 'BlockedAccount',
    onDelete: 'CASCADE'
  })
  BlockedAccount: AccountModel

  static isAccountMutedByMulti (accountIds: number[], targetAccountId: number) {
    const query = {
      attributes: [ 'accountId', 'id' ],
      where: {
        accountId: {
          [Op.in]: accountIds
        },
        targetAccountId
      },
      raw: true
    }

    return AccountBlocklistModel.unscoped()
                                .findAll(query)
                                .then(rows => {
                                  const result: { [accountId: number]: boolean } = {}

                                  for (const accountId of accountIds) {
                                    result[accountId] = !!rows.find(r => r.accountId === accountId)
                                  }

                                  return result
                                })
  }

  static loadByAccountAndTarget (accountId: number, targetAccountId: number): Bluebird<MAccountBlocklist> {
    const query = {
      where: {
        accountId,
        targetAccountId
      }
    }

    return AccountBlocklistModel.findOne(query)
  }

  static listForApi (parameters: {
    start: number
    count: number
    sort: string
    search?: string
    accountId: number
  }) {
    const { start, count, sort, search, accountId } = parameters

    const query = {
      offset: start,
      limit: count,
      order: getSort(sort)
    }

    const where = {
      accountId
    }

    if (search) {
      Object.assign(where, {
        [Op.or]: [
          searchAttribute(search, '$BlockedAccount.name$'),
          searchAttribute(search, '$BlockedAccount.Actor.url$')
        ]
      })
    }

    Object.assign(query, { where })

    return AccountBlocklistModel
      .scope([ ScopeNames.WITH_ACCOUNTS ])
      .findAndCountAll<MAccountBlocklistAccounts>(query)
      .then(({ rows, count }) => {
        return { total: count, data: rows }
      })
  }

  toFormattedJSON (this: MAccountBlocklistFormattable): AccountBlock {
    return {
      byAccount: this.ByAccount.toFormattedJSON(),
      blockedAccount: this.BlockedAccount.toFormattedJSON(),
      createdAt: this.createdAt
    }
  }
}
