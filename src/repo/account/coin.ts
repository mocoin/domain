import * as factory from '@mocoin/factory';
import * as pecorinoapi from '@motionpicture/pecorino-api-nodejs-client';
// import * as createDebug from 'debug';
import * as moment from 'moment';

// const debug = createDebug('mocoin-domain:*');
type IAuthClient = pecorinoapi.auth.ClientCredentials | pecorinoapi.auth.OAuth2;

/**
 * コイン口座リポジトリー
 */
export class PecorinoRepository {
    public readonly endpoint: string;
    public readonly depositService: pecorinoapi.service.transaction.Deposit;
    public readonly transferService: pecorinoapi.service.transaction.Transfer;
    public readonly withdrawService: pecorinoapi.service.transaction.Withdraw;

    constructor(options: {
        endpoint: string;
        authClient: IAuthClient;
    }) {
        this.endpoint = options.endpoint;
        this.depositService = new pecorinoapi.service.transaction.Deposit({
            endpoint: options.endpoint,
            auth: options.authClient
        });
        this.transferService = new pecorinoapi.service.transaction.Transfer({
            endpoint: options.endpoint,
            auth: options.authClient
        });
        this.withdrawService = new pecorinoapi.service.transaction.Withdraw({
            endpoint: options.endpoint,
            auth: options.authClient
        });
    }

    /**
     * 口座を開設する
     * @param params 口座開設初期設定
     */
    // public async open(params: {
    //     /**
    //      * 口座名義
    //      */
    //     name: string;
    //     /**
    //      * 口座番号
    //      */
    //     accountNumber: string;
    //     /**
    //      * 初期金額
    //      */
    //     initialBalance: number;
    //     /**
    //      * 開設日時
    //      */
    //     openDate: Date;
    // }): Promise<factory.account.IAccount> {
    //     debug('opening account...');
    //     const account: factory.account.IAccount = {
    //         typeOf: factory.account.AccountType.Account,
    //         accountNumber: params.accountNumber,
    //         name: params.name,
    //         balance: params.initialBalance,
    //         availableBalance: params.initialBalance,
    //         pendingTransactions: [],
    //         openDate: params.openDate,
    //         status: factory.accountStatusType.Opened
    //     };

    //     const doc = await this.accountModel.create(account);

    //     return doc.toObject();
    // }

    /**
     * 口座を解約する
     * @param params.accountNumber 口座番号
     * @param params.closeDate 解約日時
     */
    // public async close(params: {
    //     accountNumber: string;
    //     closeDate: Date;
    // }) {
    //     debug('closing account...');
    //     const doc = await this.accountModel.findOneAndUpdate(
    //         {
    //             accountNumber: params.accountNumber,
    //             pendingTransactions: { $size: 0 },
    //             status: factory.accountStatusType.Opened
    //         },
    //         {
    //             closeDate: params.closeDate,
    //             status: factory.accountStatusType.Closed
    //         },
    //         {
    //             new: true
    //         }
    //     ).exec();

    //     // NotFoundであれば口座状態確認
    //     if (doc === null) {
    //         const account = await this.findByAccountNumber(params.accountNumber);
    //         if (account.status === factory.accountStatusType.Closed) {
    //             // すでに口座解約済の場合
    //             return;
    //         } else if (account.pendingTransactions.length > 0) {
    //             // 進行中取引が存在する場合の場合
    //             throw new factory.errors.Argument('accountNumber', 'Pending transactions exist');
    //         } else {
    //             throw new factory.errors.NotFound('Account');
    //         }
    //     }
    // }

    /**
     * 口座番号で検索する
     * @param accountNumber 口座番号
     */
    // public async findByAccountNumber(accountNumber: string): Promise<factory.account.IAccount> {
    //     const doc = await this.accountModel.findOne({ accountNumber: accountNumber }).exec();
    //     if (doc === null) {
    //         throw new factory.errors.NotFound('Account');
    //     }

    //     return doc.toObject();
    // }

    /**
     * 金額を確保する
     * @see https://en.wikipedia.org/wiki/Authorization_hold
     */
    public async authorizeAmount(params: {
        transaction: factory.transaction.withdrawCoin.ITransaction | factory.transaction.transferCoin.ITransaction;
    }): Promise<factory.pecorino.transaction.withdraw.ITransaction> {
        return this.withdrawService.start({
            expires: moment(params.transaction.expires).add(1, 'hour').toDate(),
            agent: {
                typeOf: <any>params.transaction.agent.typeOf,
                id: params.transaction.agent.id,
                name: params.transaction.agent.name,
                url: params.transaction.agent.url
            },
            recipient: {
                typeOf: <any>params.transaction.recipient.typeOf,
                id: params.transaction.recipient.id,
                name: params.transaction.recipient.name,
                url: params.transaction.recipient.url
            },
            amount: params.transaction.object.amount,
            notes: params.transaction.object.notes,
            fromAccountNumber: params.transaction.object.fromLocation.accountNumber
        });
    }

    /**
     * 入金取引を開始する
     */
    public async startDeposit(params: {
        transaction: factory.transaction.depositCoin.ITransaction | factory.transaction.transferCoin.ITransaction;
    }): Promise<factory.pecorino.transaction.deposit.ITransaction> {
        return this.depositService.start({
            // 最大1ヵ月のオーソリ
            expires: moment(params.transaction.expires).add(1, 'hour').toDate(),
            agent: {
                typeOf: <any>params.transaction.agent.typeOf,
                id: params.transaction.agent.id,
                name: params.transaction.agent.name,
                url: params.transaction.agent.url
            },
            recipient: {
                typeOf: <any>params.transaction.recipient.typeOf,
                id: params.transaction.recipient.id,
                name: params.transaction.recipient.name,
                url: params.transaction.recipient.url
            },
            amount: params.transaction.object.amount,
            notes: params.transaction.object.notes,
            toAccountNumber: params.transaction.object.toLocation.accountNumber
        });
    }

    /**
     * 決済処理を実行する
     */
    public async settleTransaction(
        params: pecorinoapi.factory.transaction.ITransaction<pecorinoapi.factory.transactionType>
    ): Promise<void> {
        // 取引タイプに応じて、取引確定
        switch (params.typeOf) {
            case pecorinoapi.factory.transactionType.Deposit:
                await this.depositService.confirm({ transactionId: params.id });
                break;
            case pecorinoapi.factory.transactionType.Transfer:
                await this.transferService.confirm({ transactionId: params.id });
                break;
            case pecorinoapi.factory.transactionType.Withdraw:
                await this.withdrawService.confirm({ transactionId: params.id });
                break;

            default:
        }
    }

    /**
     * 取引を取り消す
     * 口座上で進行中の取引を中止します。
     * @see https://www.investopedia.com/terms/v/void-transaction.asp
     */
    // public async voidTransaction(params: {
    //     fromAccountNumber?: string;
    //     toAccountNumber?: string;
    //     amount: number;
    //     transactionId: string;
    // }) {
    //     // 転送元があればhold解除
    //     if (params.fromAccountNumber !== undefined) {
    //         await this.accountModel.findOneAndUpdate(
    //             {
    //                 accountNumber: params.fromAccountNumber,
    //                 'pendingTransactions.id': params.transactionId
    //             },
    //             {
    //                 $inc: {
    //                     availableBalance: params.amount // 残高調整
    //                 },
    //                 $pull: { pendingTransactions: { id: params.transactionId } }
    //             }
    //         ).exec();
    //     }

    //     // 転送先へがあれば進行中取引削除
    //     if (params.toAccountNumber !== undefined) {
    //         await this.accountModel.findOneAndUpdate(
    //             {
    //                 accountNumber: params.toAccountNumber,
    //                 'pendingTransactions.id': params.transactionId
    //             },
    //             {
    //                 $pull: { pendingTransactions: { id: params.transactionId } }
    //             }
    //         ).exec();
    //     }
    // }

    /**
     * 口座を検索する
     * @param searchConditions 検索条件
     */
    // public async search(searchConditions: {
    //     accountNumbers: string[];
    //     statuses: factory.accountStatusType[];
    //     /**
    //      * 口座名義
    //      */
    //     name?: string;
    //     limit: number;
    // }): Promise<factory.account.IAccount[]> {
    //     const andConditions: any[] = [
    //         { typeOf: factory.account.AccountType.Account }
    //     ];

    //     // tslint:disable-next-line:no-single-line-block-comment
    //     /* istanbul ignore else */
    //     if (Array.isArray(searchConditions.accountNumbers) && searchConditions.accountNumbers.length > 0) {
    //         andConditions.push({
    //             accountNumber: { $in: searchConditions.accountNumbers }
    //         });
    //     }

    //     // tslint:disable-next-line:no-single-line-block-comment
    //     /* istanbul ignore else */
    //     if (Array.isArray(searchConditions.statuses) && searchConditions.statuses.length > 0) {
    //         andConditions.push({
    //             status: { $in: searchConditions.statuses }
    //         });
    //     }

    //     // tslint:disable-next-line:no-single-line-block-comment
    //     /* istanbul ignore else */
    //     if (typeof searchConditions.name === 'string') {
    //         andConditions.push({
    //             name: new RegExp(searchConditions.name, 'gi')
    //         });
    //     }

    //     debug('finding accounts...', andConditions);

    //     return this.accountModel.find(
    //         { $and: andConditions },
    //         {
    //             __v: 0,
    //             createdAt: 0,
    //             updatedAt: 0,
    //             pendingTransactions: 0
    //         }
    //     )
    //         .sort({ accountNumber: 1 })
    //         .limit(searchConditions.limit)
    //         .exec()
    //         .then((docs) => docs.map((doc) => doc.toObject()));
    // }
}
