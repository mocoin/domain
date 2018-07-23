/**
 * タスクファンクションサービス
 * タスク名ごとに、実行するファンクションをひとつずつ定義しています
 */
import * as factory from '@mocoin/factory';
import * as pecorinoapi from '@motionpicture/pecorino-api-nodejs-client';

import { PecorinoRepository as CoinAccountRepo } from '../repo/account/coin';
import { MongoRepository as ActionRepo } from '../repo/action';
import { PecorinoRepository as BankAccountPaymentRepo } from '../repo/paymentMethod/bankAccount';
import { MongoRepository as TransactionRepo } from '../repo/transaction';

import * as CointAccountService from './account/coin';
import * as NotificationService from './notification';
import { IConnectionSettings } from './task';

export type ICoinAPIAuthClient = pecorinoapi.auth.ClientCredentials | pecorinoapi.auth.OAuth2;
export type IBankAPIAuthClient = pecorinoapi.auth.ClientCredentials | pecorinoapi.auth.OAuth2;
export type IOperation<T> = (settings: IConnectionSettings) => Promise<T>;

export function sendEmailMessage(data: factory.task.sendEmailMessage.IData): IOperation<void> {
    return async (settings: IConnectionSettings) => {
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
    return async (settings: IConnectionSettings) => {
        const cointAccountRepo = new CoinAccountRepo({
            endpoint: settings.coinAPIEndpoint,
            authClient: settings.coinAPIAuthClient
        });
        const bankAccountPaymentRepo = new BankAccountPaymentRepo({
            endpoint: settings.bankAPIEndpoint,
            authClient: settings.bankAPIAuthClient
        });
        const actionRepo = new ActionRepo(settings.connection);
        const transactionRepo = new TransactionRepo(settings.connection);
        await CointAccountService.transferMoney(data.actionAttributes)({
            action: actionRepo,
            bankAccountPayment: bankAccountPaymentRepo,
            cointAccount: cointAccountRepo,
            transaction: transactionRepo
        });
    };
}
