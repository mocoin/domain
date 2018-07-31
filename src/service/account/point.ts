/**
 * ポイント口座サービス
 */
import * as factory from '@mocoin/factory';
import * as pecorinoapi from '@pecorino/api-nodejs-client';
// import * as createDebug from 'debug';

import { handlePecorinoError } from '../../errorHandler';
import { RedisRepository as AccountNumberRepo } from '../../repo/accountNumber';

// const debug = createDebug('mocoin-domain:*');

/**
 * ポイント口座を開設する
 */
export function open(params: {
    name: string;
}) {
    return async (repos: {
        /**
         * 口座番号リポジトリー
         */
        accountNumber: AccountNumberRepo;
        /**
         * Pecorino口座サービス
         */
        accountService: pecorinoapi.service.Account;
    }) => {
        // 口座番号を発行
        const accountNumber = await repos.accountNumber.publish(new Date());

        let account: factory.pecorino.account.IAccount<factory.accountType.Point>;
        try {
            account = await repos.accountService.open<factory.accountType.Point>({
                accountType: factory.accountType.Point,
                accountNumber: accountNumber,
                name: params.name
            });
        } catch (error) {
            error = handlePecorinoError(error);
            throw error;
        }

        return account;
    };
}
