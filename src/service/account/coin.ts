/**
 * コイン口座サービス
 */
import * as factory from '@mocoin/factory';
import * as pecorinoapi from '@pecorino/api-nodejs-client';
import * as createDebug from 'debug';

import { handlePecorinoError } from '../../errorHandler';
import { PecorinoRepository as CoinAccountRepo } from '../../repo/account/coin';
import { RedisRepository as AccountNumberRepo } from '../../repo/accountNumber';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { PecorinoRepository as BankAccountPaymentRepo } from '../../repo/paymentMethod/bankAccount';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

const debug = createDebug('mocoin-domain:*');

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

        let account: factory.pecorino.account.IAccount<factory.accountType.Coin>;
        try {
            account = await repos.accountService.open<factory.accountType.Coin>({
                accountType: factory.accountType.Coin,
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

/**
 * 転送する
 * 確定取引結果から、実際の転送アクションを実行します。
 * @param actionAttributes 転送アクション属性
 */
// tslint:disable-next-line:max-func-body-length
export function transferMoney(actionAttributes: factory.action.transfer.moneyTransfer.IAttributes) {
    // tslint:disable-next-line:max-func-body-length
    return async (repos: {
        action: ActionRepo;
        bankAccountPayment: BankAccountPaymentRepo;
        coinAccount: CoinAccountRepo;
        transaction: TransactionRepo;
    }) => {
        debug(`transfering money... ${actionAttributes.purpose.typeOf} ${actionAttributes.purpose.id}`);

        // アクション開始
        const action = await repos.action.start<factory.actionType.MoneyTransfer>(actionAttributes);

        try {
            // 取引存在確認
            const transaction = await repos.transaction.findById(actionAttributes.purpose.typeOf, actionAttributes.purpose.id);
            switch (transaction.typeOf) {
                case factory.transactionType.BuyCoin:
                    // 入金処理
                    await Promise.all(transaction.object.authorizeActions
                        .filter((a) => a.object.typeOf === factory.action.authorize.deposit.ObjectType.Deposit)
                        .map(async (a: factory.action.authorize.deposit.account.coin.IAction) => {
                            return (a.result !== undefined)
                                ? repos.coinAccount.settleTransaction(a.result.pecorinoTransaction)
                                : undefined;
                        }));
                    // 出金処理
                    await Promise.all(transaction.object.authorizeActions
                        .filter((a) => a.object.typeOf === factory.action.authorize.withdraw.ObjectType.Withdraw)
                        .map(async (a: factory.action.authorize.withdraw.paymentMethod.bankAccount.IAction) => {
                            return (a.result !== undefined)
                                ? repos.bankAccountPayment.settleTransaction(a.result.pecorinoTransaction)
                                : undefined;
                        }));
                    break;

                case factory.transactionType.DepositCoin:
                    // 入金処理
                    await Promise.all(transaction.object.authorizeActions
                        .filter((a) => a.object.typeOf === factory.action.authorize.deposit.ObjectType.Deposit)
                        .map(async (a) => {
                            return (a.result !== undefined)
                                ? repos.coinAccount.settleTransaction(a.result.pecorinoTransaction)
                                : undefined;
                        }));
                    break;

                case factory.transactionType.ReturnCoin:
                    // 入金処理
                    await Promise.all(transaction.object.authorizeActions
                        .filter((a) => a.object.typeOf === factory.action.authorize.deposit.ObjectType.Deposit)
                        .map(async (a: factory.action.authorize.deposit.paymentMethod.bankAccount.IAction) => {
                            return (a.result !== undefined)
                                ? repos.bankAccountPayment.settleTransaction(a.result.pecorinoTransaction)
                                : undefined;
                        }));
                    // 出金処理
                    await Promise.all(transaction.object.authorizeActions
                        .filter((a) => a.object.typeOf === factory.action.authorize.withdraw.ObjectType.Withdraw)
                        .map(async (a: factory.action.authorize.withdraw.account.coin.IAction) => {
                            return (a.result !== undefined)
                                ? repos.coinAccount.settleTransaction(a.result.pecorinoTransaction)
                                : undefined;
                        }));
                    break;

                case factory.transactionType.TransferCoin:
                    // 転送処理
                    await Promise.all(transaction.object.authorizeActions
                        .filter((a) => a.object.typeOf === factory.action.authorize.transfer.ObjectType.Transfer)
                        .map(async (a) => {
                            return (a.result !== undefined)
                                ? repos.coinAccount.settleTransaction(a.result.pecorinoTransaction)
                                : undefined;
                        }));
                    break;

                case factory.transactionType.WithdrawCoin:
                    // 出金処理
                    await Promise.all(transaction.object.authorizeActions
                        .filter((a) => a.object.typeOf === factory.action.authorize.withdraw.ObjectType.Withdraw)
                        .map(async (a) => {
                            return (a.result !== undefined)
                                ? repos.coinAccount.settleTransaction(a.result.pecorinoTransaction)
                                : undefined;
                        }));
                    break;

                default:
            }
        } catch (error) {
            // actionにエラー結果を追加
            try {
                const actionError = { ...error, ...{ message: error.message, name: error.name } };
                await repos.action.giveUp(action.typeOf, action.id, actionError);
            } catch (__) {
                // 失敗したら仕方ない
            }

            throw error;
        }

        // アクション完了
        debug('ending action...');
        const actionResult: factory.action.transfer.moneyTransfer.IResult = {};
        await repos.action.complete(action.typeOf, action.id, actionResult);
    };
}

/**
 * 転送取消
 * 期限切れ、あるいは、中止された取引から、転送をアクションを取り消します。
 * @param params.transaction 転送アクションを実行しようとしていた取引
 */
export function cancelMoneyTransfer(params: {
    transaction: {
        typeOf: factory.transactionType;
        id: string;
    };
}) {
    return async (repos: {
        bankAccountPayment: BankAccountPaymentRepo;
        coinAccount: CoinAccountRepo;
        transaction: TransactionRepo;
    }) => {
        debug(`canceling money transfer... ${params.transaction.typeOf} ${params.transaction.id}`);
        // 取引存在確認
        const transaction = await repos.transaction.findById(params.transaction.typeOf, params.transaction.id);
        switch (transaction.typeOf) {
            case factory.transactionType.BuyCoin:
                // 入金処理
                await Promise.all(transaction.object.authorizeActions
                    .filter((a) => a.object.typeOf === factory.action.authorize.deposit.ObjectType.Deposit)
                    .map(async (a: factory.action.authorize.deposit.account.coin.IAction) => {
                        return (a.result !== undefined)
                            ? repos.coinAccount.voidTransaction(a.result.pecorinoTransaction)
                            : undefined;
                    }));
                // 出金処理
                await Promise.all(transaction.object.authorizeActions
                    .filter((a) => a.object.typeOf === factory.action.authorize.withdraw.ObjectType.Withdraw)
                    .map(async (a: factory.action.authorize.withdraw.paymentMethod.bankAccount.IAction) => {
                        return (a.result !== undefined)
                            ? repos.bankAccountPayment.voidTransaction(a.result.pecorinoTransaction)
                            : undefined;
                    }));
                break;

            case factory.transactionType.DepositCoin:
                // 入金処理
                await Promise.all(transaction.object.authorizeActions
                    .filter((a) => a.object.typeOf === factory.action.authorize.deposit.ObjectType.Deposit)
                    .map(async (a) => {
                        return (a.result !== undefined)
                            ? repos.coinAccount.voidTransaction(a.result.pecorinoTransaction)
                            : undefined;
                    }));
                break;

            case factory.transactionType.ReturnCoin:
                // 入金処理
                await Promise.all(transaction.object.authorizeActions
                    .filter((a) => a.object.typeOf === factory.action.authorize.deposit.ObjectType.Deposit)
                    .map(async (a: factory.action.authorize.deposit.paymentMethod.bankAccount.IAction) => {
                        return (a.result !== undefined)
                            ? repos.bankAccountPayment.voidTransaction(a.result.pecorinoTransaction)
                            : undefined;
                    }));
                // 出金処理
                await Promise.all(transaction.object.authorizeActions
                    .filter((a) => a.object.typeOf === factory.action.authorize.withdraw.ObjectType.Withdraw)
                    .map(async (a: factory.action.authorize.withdraw.account.coin.IAction) => {
                        return (a.result !== undefined)
                            ? repos.coinAccount.voidTransaction(a.result.pecorinoTransaction)
                            : undefined;
                    }));
                break;

            case factory.transactionType.TransferCoin:
                // 転送処理
                await Promise.all(transaction.object.authorizeActions
                    .filter((a) => a.object.typeOf === factory.action.authorize.transfer.ObjectType.Transfer)
                    .map(async (a) => {
                        return (a.result !== undefined)
                            ? repos.coinAccount.voidTransaction(a.result.pecorinoTransaction)
                            : undefined;
                    }));
                break;

            case factory.transactionType.WithdrawCoin:
                // 出金処理
                await Promise.all(transaction.object.authorizeActions
                    .filter((a) => a.object.typeOf === factory.action.authorize.withdraw.ObjectType.Withdraw)
                    .map(async (a) => {
                        return (a.result !== undefined)
                            ? repos.coinAccount.voidTransaction(a.result.pecorinoTransaction)
                            : undefined;
                    }));
                break;

            default:
        }
    };
}
