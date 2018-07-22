/**
 * コイン口座サービス
 */
import * as factory from '@mocoin/factory';
import * as pecorinoapi from '@motionpicture/pecorino-api-nodejs-client';
import * as createDebug from 'debug';

import { handlePecorinoError } from '../../errorHandler';
import { PecorinoRepository as CoinAccountRepo } from '../../repo/account/coin';
import { RedisRepository as AccountNumberRepo } from '../../repo/accountNumber';
import { MongoRepository as ActionRepo } from '../../repo/action';
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

        let account: factory.pecorino.account.IAccount;
        try {
            account = await repos.accountService.open({
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
    return async (repos: {
        action: ActionRepo;
        cointAccount: CoinAccountRepo;
        transaction: TransactionRepo;
    }) => {
        debug(`transfering money... ${actionAttributes.purpose.typeOf} ${actionAttributes.purpose.id}`);

        // アクション開始
        const action = await repos.action.start<factory.actionType.MoneyTransfer>(actionAttributes);

        try {
            // 取引存在確認
            const transaction = await repos.transaction.findById(actionAttributes.purpose.typeOf, actionAttributes.purpose.id);

            // const fromLocation = (actionAttributes.fromLocation.typeOf === factory.account.AccountType.Account)
            //     ? (<factory.action.transfer.moneyTransfer.IAccount>actionAttributes.fromLocation).accountNumber
            //     // tslint:disable-next-line:no-single-line-block-comment
            //     /* istanbul ignore next */
            //     : undefined;
            // const toAccountNumber = (actionAttributes.toLocation.typeOf === factory.account.AccountType.Account)
            //     ? (<factory.action.transfer.moneyTransfer.IAccount>actionAttributes.toLocation).accountNumber
            //     // tslint:disable-next-line:no-single-line-block-comment
            //     /* istanbul ignore next */
            //     : undefined;

            switch (transaction.typeOf) {
                case factory.transactionType.DepositCoin:
                    // 入金処理
                    switch (actionAttributes.toLocation.typeOf) {
                        // コイン口座から出金の場合
                        case factory.ownershipInfo.AccountGoodType.CoinAccount:
                            const authorizeAction = transaction.object.authorizeActions.find(
                                (a) => a.object.typeOf === factory.action.authorize.deposit.ObjectType.Deposit
                            );
                            if (authorizeAction === undefined || authorizeAction.result === undefined) {
                                throw new Error('authorizeAction not found');
                            }
                            await repos.cointAccount.settleTransaction(authorizeAction.result.pecorinoTransaction);
                            break;

                        default:
                    }
                    break;

                case factory.transactionType.TransferCoin:
                    // 入金処理
                    switch (actionAttributes.toLocation.typeOf) {
                        // コイン口座へ入金の場合
                        case factory.ownershipInfo.AccountGoodType.CoinAccount:
                            const authorizeAction = transaction.object.authorizeActions.find(
                                (a) => a.object.typeOf === factory.action.authorize.deposit.ObjectType.Deposit
                            );
                            if (authorizeAction === undefined || authorizeAction.result === undefined) {
                                throw new Error('authorizeAction not found');
                            }
                            await repos.cointAccount.settleTransaction(authorizeAction.result.pecorinoTransaction);
                            break;

                        case 'PaymentMethod':
                            break;
                        default:
                    }
                    break;

                case factory.transactionType.WithdrawCoin:
                    // 入金処理
                    switch (actionAttributes.fromLocation.typeOf) {
                        // コイン口座から出金の場合
                        case factory.ownershipInfo.AccountGoodType.CoinAccount:
                            const authorizeAction = transaction.object.authorizeActions.find(
                                (a) => a.object.typeOf === factory.action.authorize.withdraw.ObjectType.Withdraw
                            );
                            if (authorizeAction === undefined || authorizeAction.result === undefined) {
                                throw new Error('authorizeAction not found');
                            }
                            await repos.cointAccount.settleTransaction(authorizeAction.result.pecorinoTransaction);
                            break;

                        default:
                    }
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
// export function cancelMoneyTransfer(params: {
//     transaction: {
//         typeOf: factory.transactionType;
//         id: string;
//     };
// }) {
//     return async (repos: {
//         // account: AccountRepo;
//         transaction: TransactionRepo;
//     }) => {
//         debug(`canceling money transfer... ${params.transaction.typeOf} ${params.transaction.id}`);
//         let fromAccountNumber: string | undefined;
//         let toAccountNumber: string | undefined;
//         // 取引存在確認
//         const transaction = await repos.transaction.findById(params.transaction.typeOf, params.transaction.id);

//         switch (params.transaction.typeOf) {
//             case factory.transactionType.DepositCoin:
//                 toAccountNumber =
//                     (<factory.transaction.ITransaction<factory.transactionType.DepositCoin>>transaction).object.toAccountNumber;
//                 break;
//             case factory.transactionType.WithdrawCoin:
//                 fromAccountNumber =
//                     (<factory.transaction.ITransaction<factory.transactionType.WithdrawCoin>>transaction).object.fromAccountNumber;
//                 break;
//             case factory.transactionType.TransferCoin:
//                 fromAccountNumber =
//                     (<factory.transaction.ITransaction<factory.transactionType.TransferCoin>>transaction).object.fromAccountNumber;
//                 toAccountNumber =
//                     (<factory.transaction.ITransaction<factory.transactionType.TransferCoin>>transaction).object.toAccountNumber;
//                 break;
//             default:
//                 throw new factory.errors.Argument('typeOf', `transaction type ${params.transaction.typeOf} unknown`);
//         }

//         await repos.account.voidTransaction({
//             fromAccountNumber: fromAccountNumber,
//             toAccountNumber: toAccountNumber,
//             amount: transaction.object.amount,
//             transactionId: transaction.id
//         });
//     };
// }
