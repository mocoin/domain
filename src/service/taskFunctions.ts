/**
 * タスクファンクションサービス
 * タスク名ごとに、実行するファンクションをひとつずつ定義しています
 */
import * as factory from '@mocoin/factory';
import * as pecorinoapi from '@motionpicture/pecorino-api-nodejs-client';
import * as mongoose from 'mongoose';
import * as redis from 'redis';

import { PecorinoRepository as CoinAccountRepo } from '../repo/account/coin';
import { MongoRepository as ActionRepo } from '../repo/action';
import { MongoRepository as TransactionRepo } from '../repo/transaction';

import * as CointAccountService from './account/coin';
import * as NotificationService from './notification';

export type ICoinAPIAuthClient = pecorinoapi.auth.ClientCredentials | pecorinoapi.auth.OAuth2;
export type IOperation<T> = (settings: {
    /**
     * MongoDBコネクション
     */
    connection: mongoose.Connection;
    /**
     * Redisクライアント
     */
    redisClient?: redis.RedisClient;
    /**
     * PecorinoAPI認証クライアント
     */
    pecorinoAuthClient?: pecorinoapi.auth.ClientCredentials;
    /**
     * Cognitoサービスプロバイダー
     */
    cognitoIdentityServiceProvider?: AWS.CognitoIdentityServiceProvider;
}) => Promise<T>;

export function sendEmailMessage(data: factory.task.sendEmailMessage.IData): IOperation<void> {
    return async (settings: {
        connection: mongoose.Connection;
        pecorinoAuthClient?: pecorinoapi.auth.ClientCredentials;
    }) => {
        const actionRepo = new ActionRepo(settings.connection);
        await NotificationService.sendEmailMessage(data.actionAttributes)({ action: actionRepo });
    };
}

// export function cancelMoneyTransfer(
//     data: factory.task.cancelMoneyTransfer.IData
// ): IOperation<void> {
//     return async (settings: {
//         connection: mongoose.Connection;
//     }) => {
//         const accountRepo = new AccountRepo(settings.connection);
//         const transactionRepo = new TransactionRepo(settings.connection);
//         await AccountService.cancelMoneyTransfer({ transaction: data.transaction })({
//             account: accountRepo,
//             transaction: transactionRepo
//         });
//     };
// }

export function moneyTransfer(
    data: factory.task.moneyTransfer.IData
): IOperation<void> {
    return async (settings: {
        connection: mongoose.Connection;
        coinAPIEndpoint: string;
        coinAPIAuthClient: ICoinAPIAuthClient;
    }) => {
        const cointAccountRepo = new CoinAccountRepo({
            endpoint: settings.coinAPIEndpoint,
            authClient: settings.coinAPIAuthClient
        });
        const actionRepo = new ActionRepo(settings.connection);
        const transactionRepo = new TransactionRepo(settings.connection);
        await CointAccountService.transferMoney(data.actionAttributes)({
            action: actionRepo,
            cointAccount: cointAccountRepo,
            transaction: transactionRepo
        });
    };
}
