import * as factory from '@mocoin/factory';
import * as createDebug from 'debug';
import { Connection } from 'mongoose';

import ActionModel from './mongoose/model/action';

const debug = createDebug('mocoin-domain:*');

export type IAuthorizeAction = factory.action.authorize.IAction<factory.action.authorize.IAttributes<any, any>>;
export type IAction<T> =
    T extends factory.actionType.AuthorizeAction ? factory.action.authorize.IAction<factory.action.authorize.IAttributes<any, any>> :
    T extends factory.actionType.MoneyTransfer ? factory.action.transfer.moneyTransfer.IAction :
    factory.action.IAction<factory.action.IAttributes<any, any>>;

/**
 * コイン転送アクション検索条件インターフェース
 */
export interface ISearchMoneyTransferActionsConditions {
    accountNumber: string;
    limit?: number;
}

/**
 * アクションリポジトリー
 */
export class MongoRepository {
    public readonly actionModel: typeof ActionModel;

    constructor(connection: Connection) {
        this.actionModel = connection.model(ActionModel.modelName);
    }

    /**
     * アクション開始
     */
    public async start<T extends factory.actionType>(params: factory.action.IAttributes<any, any>): Promise<IAction<T>> {
        return this.actionModel.create({
            ...params,
            actionStatus: factory.actionStatusType.ActiveActionStatus,
            startDate: new Date()
        }).then(
            (doc) => doc.toObject()
        );
    }

    /**
     * アクション完了
     */
    public async complete<T extends factory.actionType>(
        typeOf: T,
        actionId: string,
        result: any
    ): Promise<IAction<T>> {
        return this.actionModel.findOneAndUpdate(
            {
                typeOf: typeOf,
                _id: actionId
            },
            {
                actionStatus: factory.actionStatusType.CompletedActionStatus,
                result: result,
                endDate: new Date()
            },
            { new: true }
        ).exec().then((doc) => {
            if (doc === null) {
                throw new factory.errors.NotFound('action');
            }

            return doc.toObject();
        });
    }

    /**
     * アクション中止
     */
    public async cancel<T extends factory.actionType>(
        typeOf: T,
        actionId: string
    ): Promise<IAction<T>> {
        return this.actionModel.findOneAndUpdate(
            {
                typeOf: typeOf,
                _id: actionId
            },
            { actionStatus: factory.actionStatusType.CanceledActionStatus },
            { new: true }
        ).exec()
            .then((doc) => {
                if (doc === null) {
                    throw new factory.errors.NotFound('action');

                }

                return doc.toObject();
            });
    }

    /**
     * アクション失敗
     */
    public async giveUp<T extends factory.actionType>(
        typeOf: T,
        actionId: string,
        error: any
    ): Promise<IAction<T>> {
        return this.actionModel.findOneAndUpdate(
            {
                typeOf: typeOf,
                _id: actionId
            },
            {
                actionStatus: factory.actionStatusType.FailedActionStatus,
                error: error,
                endDate: new Date()
            },
            { new: true }
        ).exec().then((doc) => {
            if (doc === null) {
                throw new factory.errors.NotFound('action');
            }

            return doc.toObject();
        });
    }

    /**
     * IDで取得する
     */
    public async findById<T extends factory.actionType>(
        typeOf: T,
        actionId: string
    ): Promise<IAction<T>> {
        return this.actionModel.findOne(
            {
                typeOf: typeOf,
                _id: actionId
            }
        ).exec()
            .then((doc) => {
                if (doc === null) {
                    throw new factory.errors.NotFound('action');
                }

                return doc.toObject();
            });
    }

    /**
     * 取引内の承認アクションを取得する
     * @param transactionId 取引ID
     */
    public async findAuthorizeByTransactionId(transactionId: string): Promise<IAuthorizeAction[]> {
        return this.actionModel.find({
            typeOf: factory.actionType.AuthorizeAction,
            'purpose.id': {
                $exists: true,
                $eq: transactionId
            }
        }).exec().then((docs) => docs.map((doc) => doc.toObject()));
    }

    /**
     * コイン転送アクションを検索する
     * @param searchConditions 検索条件
     */
    public async searchMoneyTransferActions(
        searchConditions: ISearchMoneyTransferActionsConditions
    ): Promise<factory.action.transfer.moneyTransfer.IAction[]> {
        // tslint:disable-next-line:no-magic-numbers no-single-line-block-comment
        const limit = (searchConditions.limit !== undefined) ? searchConditions.limit : /* istanbul ignore next*/ 100;

        return this.actionModel.find({
            $or: [
                {
                    typeOf: factory.actionType.MoneyTransfer,
                    'fromLocation.typeOf': factory.ownershipInfo.AccountGoodType.Account,
                    'fromLocation.accountType': factory.accountType.Coin,
                    'fromLocation.accountNumber': searchConditions.accountNumber
                },
                {
                    typeOf: factory.actionType.MoneyTransfer,
                    'toLocation.typeOf': factory.ownershipInfo.AccountGoodType.Account,
                    'toLocation.accountType': factory.accountType.Coin,
                    'toLocation.accountNumber': searchConditions.accountNumber
                }
            ]
        })
            .sort({ endDate: -1 }).limit(limit)
            .exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
    }

    /**
     * アクションを検索する
     * @param searchConditions 検索条件
     */
    public async search<T extends factory.actionType>(searchConditions: {
        typeOf: T;
        actionStatuses?: factory.actionStatusType[];
        startDateFrom?: Date;
        startDateThrough?: Date;
        purposeTypeOfs?: factory.transactionType[];
        fromLocationAccountNumbers?: string[];
        toLocationAccountNumbers?: string[];
        limit: number;
    }): Promise<IAction<T>[]> {
        const andConditions: any[] = [
            { typeOf: searchConditions.typeOf },
            {
                startDate: {
                    $exists: true,
                    $gte: searchConditions.startDateFrom,
                    $lte: searchConditions.startDateThrough
                }
            }
        ];

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(searchConditions.actionStatuses) && searchConditions.actionStatuses.length > 0) {
            andConditions.push({
                actionStatus: { $in: searchConditions.actionStatuses }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(searchConditions.purposeTypeOfs) && searchConditions.purposeTypeOfs.length > 0) {
            andConditions.push({
                'purpose.typeOf': {
                    $exists: true,
                    $in: searchConditions.purposeTypeOfs
                }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(searchConditions.fromLocationAccountNumbers) && searchConditions.fromLocationAccountNumbers.length > 0) {
            andConditions.push({
                'fromLocation.accountNumber': {
                    $exists: true,
                    $in: searchConditions.fromLocationAccountNumbers
                }
            });
        }

        // tslint:disable-next-line:no-single-line-block-comment
        /* istanbul ignore else */
        if (Array.isArray(searchConditions.toLocationAccountNumbers) && searchConditions.toLocationAccountNumbers.length > 0) {
            andConditions.push({
                'toLocation.accountNumber': {
                    $exists: true,
                    $in: searchConditions.toLocationAccountNumbers
                }
            });
        }

        debug('finding actions...', andConditions);

        return this.actionModel.find(
            { $and: andConditions },
            {
                __v: 0,
                createdAt: 0,
                updatedAt: 0
            }
        )
            .sort({ _id: 1 })
            .limit(searchConditions.limit)
            .exec()
            .then((docs) => docs.map((doc) => doc.toObject()));
    }
}
