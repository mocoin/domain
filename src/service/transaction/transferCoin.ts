/**
 * コイン転送取引サービス
 */
import * as factory from '@mocoin/factory';
// import * as pecorinoapi from '@motionpicture/pecorino-api-nodejs-client';
import * as createDebug from 'debug';

import { PecorinoRepository as CoinAccountRepo } from '../../repo/account/coin';
import { MongoRepository as ActionRepo } from '../../repo/action';
import { MongoRepository as TaskRepository } from '../../repo/task';
import { MongoRepository as TransactionRepo } from '../../repo/transaction';

// import { handlePecorinoError } from '../../errorHandler';

const debug = createDebug('mocoin-domain:');

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
}) => Promise<T>;
export type IAuthorizeDepositCoinOperation<T> = (repos: {
    action: ActionRepo;
    coinAccount: CoinAccountRepo;
}) => Promise<T>;

/**
 * 取引開始
 */
export function start(
    params: factory.transaction.IStartParams<factory.transactionType.TransferCoin>
): IStartOperation<factory.transaction.transferCoin.ITransaction> {
    return async (repos: {
        action: ActionRepo;
        coinAccount: CoinAccountRepo;
        transaction: TransactionRepo;
    }) => {
        debug(`${params.agent.name} is starting transfer transaction... amount:${params.object.amount}`);

        // 口座存在確認
        // const fromAccount = await repos.account.findByAccountNumber(params.object.fromAccountNumber);
        // const toAccount = await repos.account.findByAccountNumber(params.object.toAccountNumber);

        // 取引オブジェクトを作成
        const startParams: factory.transaction.IStartParams<factory.transactionType.TransferCoin> = {
            typeOf: factory.transactionType.TransferCoin,
            agent: params.agent,
            recipient: params.recipient,
            object: {
                amount: params.object.amount,
                fromLocation: params.object.fromLocation,
                toLocation: params.object.toLocation,
                notes: params.object.notes,
                authorizeActions: []
            },
            expires: params.expires
        };

        // 取引作成
        let transaction: factory.transaction.transferCoin.ITransaction;
        try {
            transaction = await repos.transaction.start(factory.transactionType.TransferCoin, startParams);
        } catch (error) {
            // tslint:disable-next-line:no-single-line-block-comment
            /* istanbul ignore next */
            if (error.name === 'MongoError') {
                // no op
            }

            throw error;
        }

        // 結果返却
        return transaction;
    };
}

/**
 * 取引確定
 */
export function confirm(params: {
    confirmDate: Date;
    transactionId: string;
}): ITransactionOperation<void> {
    return async (repos: {
        action: ActionRepo;
        transaction: TransactionRepo;
    }) => {
        debug(`confirming transfer transaction ${params.transactionId}...`);

        // 取引存在確認
        const transaction = await repos.transaction.findById(factory.transactionType.TransferCoin, params.transactionId);

        // 取引に対する全ての承認アクションをマージ
        let authorizeActions = await repos.action.findAuthorizeByTransactionId(params.transactionId);
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
            toLocation: transaction.object.toLocation,
            purpose: {
                typeOf: transaction.typeOf,
                id: transaction.id
            }
        };
        const potentialActions: factory.transaction.transferCoin.IPotentialActions = {
            moneyTransfer: moneyTransferActionAttributes
        };

        // 取引確定
        debug('finally confirming transaction...');
        await repos.transaction.confirm(factory.transactionType.TransferCoin, transaction.id, transaction.object, {}, potentialActions);
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
        const transaction = await repos.transaction.startExportTasks(factory.transactionType.TransferCoin, status);
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
        const transaction = await repos.transaction.findById(factory.transactionType.TransferCoin, transactionId);
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
