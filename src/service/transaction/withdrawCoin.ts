/**
 * コイン出金取引サービス
 */
import * as factory from '@mocoin/factory';
import * as pecorinoapi from '@pecorino/api-nodejs-client';
import * as createDebug from 'debug';
import * as moment from 'moment';

import { PecorinoRepository as CoinAccountRepo } from '../../repo/account/coin';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as OwnershipInfoRepo } from '../../repo/ownershipInfo';
import { MongoRepository as TaskRepository } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

import { handlePecorinoError } from '../../errorHandler';
import * as TransactionUtil from './util';

const debug = createDebug('mocoin-domain:');

export type ITransaction = factory.transaction.withdrawCoin.ITransaction;
export type IStartOperation<T> = (repos: {
    action: ActionRepo;
    coinAccount: CoinAccountRepo;
    transaction: TransactionRepo;
}) => Promise<T>;
export type ITaskAndTransactionOperation<T> = (repos: {
    task: TaskRepository;
    transaction: TransactionRepo;
}) => Promise<T>;
export type ITransactionOperation<T> = (repos: {
    action: ActionRepo;
    transaction: TransactionRepo;
    ownershipInfo: OwnershipInfoRepo;
    depositPointService: pecorinoapi.service.transaction.Deposit;
}) => Promise<T>;
export type IAuthorizeWithdrawCoinOperation<T> = (repos: {
    action: ActionRepo;
    coinAccount: CoinAccountRepo;
}) => Promise<T>;

/**
 * 取引開始
 */
export function start(
    params: factory.transaction.IStartParams<factory.transactionType.WithdrawCoin>
): IStartOperation<factory.transaction.ITokenizedTransaction> {
    return async (repos: {
        action: ActionRepo;
        coinAccount: CoinAccountRepo;
        transaction: TransactionRepo;
    }) => {
        debug(`${params.agent.name} is starting withdraw transaction... amount:${params.object.amount}`);

        // 口座存在確認
        // const account = await repos.account.findByAccountNumber(params.object.fromAccountNumber);

        // 取引ファクトリーで新しい進行中取引オブジェクトを作成
        const startParams: factory.transaction.IStartParams<factory.transactionType.WithdrawCoin> = {
            typeOf: factory.transactionType.WithdrawCoin,
            agent: params.agent,
            recipient: params.recipient,
            object: {
                amount: params.object.amount,
                fromLocation: params.object.fromLocation,
                notes: params.object.notes,
                authorizeActions: []
            },
            expires: params.expires
        };

        // 取引作成
        let transaction: factory.transaction.withdrawCoin.ITransaction;
        try {
            transaction = await repos.transaction.start(factory.transactionType.WithdrawCoin, startParams);
        } catch (error) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore next */
            if (error.name === 'MongoError') {
                // no op
            }

            throw error;
        }

        // 残高確保
        await authorizeWithdrawCoinAccount(transaction)(repos);

        // 取引を暗号化する
        return TransactionUtil.sign<ITransaction>(transaction);
    };
}

function authorizeWithdrawCoinAccount(
    params: factory.transaction.withdrawCoin.ITransaction
): IAuthorizeWithdrawCoinOperation<factory.action.authorize.withdraw.account.coin.IAction> {
    return async (repos: {
        action: ActionRepo;
        coinAccount: CoinAccountRepo;
    }) => {
        // 他者口座による決済も可能にするためにコメントアウト
        // 基本的に、自分の口座のオーソリを他者に与えても得しないので、
        // これが問題になるとすれば、本当にただサービスを荒らしたい悪質な攻撃のみ、ではある
        // if (transaction.agent.id !== agentId) {
        //     throw new factory.errors.Forbidden('A specified transaction is not yours.');
        // }

        // 承認アクションを開始する
        const actionAttributes: factory.action.authorize.withdraw.account.coin.IAttributes = {
            typeOf: factory.actionType.AuthorizeAction,
            object: {
                typeOf: factory.action.authorize.withdraw.ObjectType.Withdraw,
                amount: params.object.amount,
                fromLocation: params.object.fromLocation,
                notes: params.object.notes
            },
            agent: params.agent,
            recipient: params.recipient,
            purpose: params
        };
        const action = await repos.action.start(actionAttributes);

        let pecorinoTransaction: pecorinoapi.factory.transaction.withdraw.ITransaction<factory.accountType.Coin>;
        try {
            debug('starting pecorino transaction...');
            pecorinoTransaction = await repos.coinAccount.authorizeAmount({
                transaction: params
            });
            debug('pecorinoTransaction started.', pecorinoTransaction.id);
        } catch (error) {
            // actionにエラー結果を追加
            try {
                // tslint:disable-next-line:max-line-length no-single-line-block-comment
                const actionError = { ...error, ...{ name: error.name, message: error.message } };
                await repos.action.giveUp(action.typeOf, action.id, actionError);
            } catch (__) {
                // 失敗したら仕方ない
            }

            // PecorinoAPIのエラーｗｐハンドリング
            error = handlePecorinoError(error);
            throw error;
        }

        // アクションを完了
        debug('ending authorize action...');
        const actionResult: factory.action.authorize.withdraw.account.coin.IResult = {
            amount: params.object.amount,
            pecorinoTransaction: pecorinoTransaction,
            pecorinoEndpoint: repos.coinAccount.endpoint
        };

        return repos.action.complete(<factory.actionType.AuthorizeAction>action.typeOf, action.id, actionResult);
    };
}

/**
 * 取引確定
 */
export function confirm(params: {
    confirmDate: Date;
    token: string;
}): ITransactionOperation<factory.transaction.withdrawCoin.IResult> {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
        ownershipInfo: OwnershipInfoRepo;
        depositPointService: pecorinoapi.service.transaction.Deposit;
    }) => {
        // 取引存在確認
        let transaction = await TransactionUtil.verify<ITransaction>({ token: params.token });
        transaction = await repos.transaction.findById(factory.transactionType.WithdrawCoin, transaction.id);

        // 取引に対する全ての承認アクションをマージ
        let authorizeActions = await repos.action.findAuthorizeByTransactionId(transaction.id);
        // 万が一このプロセス中に他処理が発生してもそれらを無視するように、endDateでフィルタリング
        authorizeActions = authorizeActions.filter((a) => (a.endDate !== undefined && a.endDate < params.confirmDate));
        transaction.object.authorizeActions = authorizeActions;
        debug('confirming transaction on', authorizeActions.length, 'authorize actions...');

        // 現金転送アクション属性作成
        const moneyTransferActionAttributes: factory.action.transfer.moneyTransfer.IAttributes = {
            typeOf: factory.actionType.MoneyTransfer,
            description: transaction.object.notes,
            result: {
                amount: transaction.object.amount
            },
            object: {
            },
            agent: transaction.agent,
            recipient: transaction.recipient,
            amount: transaction.object.amount,
            fromLocation: transaction.object.fromLocation,
            toLocation: {
                typeOf: factory.action.transfer.moneyTransfer.LocationType.Anonymous,
                name: transaction.recipient.name
            },
            purpose: {
                typeOf: transaction.typeOf,
                id: transaction.id
            }
        };
        const potentialActions: factory.transaction.withdrawCoin.IPotentialActions = {
            moneyTransfer: moneyTransferActionAttributes
        };

        // 本来ポイントインセンティブ付与をタスクに追加するが、ひとまず同期的にポイント入金
        if (transaction.agent.id !== undefined) {
            try {
                const INCENTIVE = 1;
                debug('searching point account ownershipInfo...', transaction.agent.id);
                let ownershipInfos = await repos.ownershipInfo.search({
                    goodType: factory.ownershipInfo.AccountGoodType.Account,
                    ownedBy: transaction.agent.id,
                    ownedAt: new Date()
                });
                ownershipInfos = ownershipInfos.filter((o) => o.typeOfGood.accountType === factory.accountType.Point);
                debug(ownershipInfos.length, ' point account ownershipInfos found.');
                if (ownershipInfos.length !== 0) {
                    const depositTransaction = await repos.depositPointService.start({
                        toAccountNumber: ownershipInfos[0].typeOfGood.accountNumber,
                        expires: moment().add(1, 'minute').toDate(),
                        agent: transaction.recipient,
                        recipient: transaction.agent,
                        amount: INCENTIVE,
                        accountType: factory.accountType.Point,
                        notes: 'コイン決済インセンティブ'
                    });
                    debug('deposit point transaction started.', depositTransaction.id);
                    await repos.depositPointService.confirm({ transactionId: depositTransaction.id });
                }
            } catch (error) {
                console.error(error);
            }
        }

        // 取引確定
        debug('finally confirming transaction...');
        await repos.transaction.confirm(factory.transactionType.WithdrawCoin, transaction.id, transaction.object, {}, potentialActions);
    };
}

/**
 * ひとつの取引のタスクをエクスポートする
 */
export function exportTasks(status: factory.transactionStatusType) {
    return async (repos: {
        task: TaskRepository;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.startExportTasks(factory.transactionType.WithdrawCoin, status);
        if (transaction === null) {
            return;
        }

        // 失敗してもここでは戻さない(RUNNINGのまま待機)
        await exportTasksById(transaction.id)(repos);

        await repos.transaction.setTasksExportedById(transaction.id);
    };
}

/**
 * ID指定で取引のタスク出力
 */
export function exportTasksById(transactionId: string): ITaskAndTransactionOperation<factory.task.ITask[]> {
    return async (repos: {
        task: TaskRepository;
        transaction: TransactionRepo;
    }) => {
        const transaction = await repos.transaction.findById(factory.transactionType.WithdrawCoin, transactionId);
        const potentialActions = transaction.potentialActions;

        const taskAttributes: factory.task.IAttributes[] = [];
        switch (transaction.status) {
            case factory.transactionStatusType.Confirmed:
                // tslint:disable-next-line:no-single-line-block-comment
                /* istanbul ignore else */
                if (potentialActions !== undefined) {
                    // tslint:disable-next-line:no-single-line-block-comment
                    /* istanbul ignore else */
                    if (potentialActions.moneyTransfer !== undefined) {
                        const moneyTransferTask: factory.task.moneyTransfer.IAttributes = {
                            name: factory.taskName.MoneyTransfer,
                            status: factory.taskStatus.Ready,
                            runsAt: new Date(), // なるはやで実行
                            remainingNumberOfTries: 10,
                            lastTriedAt: null,
                            numberOfTried: 0,
                            executionResults: [],
                            data: {
                                actionAttributes: potentialActions.moneyTransfer
                            }
                        };
                        taskAttributes.push(moneyTransferTask);
                    }
                }
                break;

            case factory.transactionStatusType.Canceled:
            case factory.transactionStatusType.Expired:
                const cancelMoneyTransferTask: factory.task.cancelMoneyTransfer.IAttributes = {
                    name: factory.taskName.CancelMoneyTransfer,
                    status: factory.taskStatus.Ready,
                    runsAt: new Date(), // なるはやで実行
                    remainingNumberOfTries: 10,
                    lastTriedAt: null,
                    numberOfTried: 0,
                    executionResults: [],
                    data: {
                        transaction: { typeOf: transaction.typeOf, id: transaction.id }
                    }
                };
                taskAttributes.push(cancelMoneyTransferTask);
                break;

            default:
                throw new factory.errors.NotImplemented(`Transaction status "${transaction.status}" not implemented.`);
        }
        debug('taskAttributes prepared', taskAttributes);

        return Promise.all(taskAttributes.map(async (a) => repos.task.save(a)));
    };
}
