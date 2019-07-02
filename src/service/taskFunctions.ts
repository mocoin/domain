/**
 * タスクファンクションサービス
 * タスク名ごとに、実行するファンクションをひとつずつ定義しています
 */
import * as factory from '@mocoin/factory';
import * as pecorinoapi from '@pecorino/api-nodejs-client';

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

export function cancelMoneyTransfer(
    data: factory.task.cancelMoneyTransfer.IData
): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const coinAccountRepo = new CoinAccountRepo({
            endpoint: settings.coinAPIEndpoint,
            authClient: settings.coinAPIAuthClient
        });
        const bankAccountPaymentRepo = new BankAccountPaymentRepo({
            endpoint: settings.bankAPIEndpoint,
            authClient: settings.bankAPIAuthClient
        });
        const transactionRepo = new TransactionRepo(settings.connection);
        await CointAccountService.cancelMoneyTransfer(data)({
            bankAccountPayment: bankAccountPaymentRepo,
            coinAccount: coinAccountRepo,
            transaction: transactionRepo
        });
    };
}

export function moneyTransfer(
    data: factory.task.moneyTransfer.IData
): IOperation<void> {
    return async (settings: IConnectionSettings) => {
        const coinAccountRepo = new CoinAccountRepo({
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
            coinAccount: coinAccountRepo,
            transaction: transactionRepo
        });
    };
}
