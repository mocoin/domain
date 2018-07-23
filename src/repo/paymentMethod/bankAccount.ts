import * as factory from '@mocoin/factory';
import * as pecorinoapi from '@motionpicture/pecorino-api-nodejs-client';
// import * as createDebug from 'debug';
import * as moment from 'moment';

// const debug = createDebug('mocoin-domain:*');
type IAuthClient = pecorinoapi.auth.ClientCredentials | pecorinoapi.auth.OAuth2;

/**
 * 銀行口座リポジトリー
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
        transaction: factory.transaction.buyCoin.ITransaction;
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
        transaction: factory.transaction.returnCoin.ITransaction;
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
    public async voidTransaction(
        params: pecorinoapi.factory.transaction.ITransaction<pecorinoapi.factory.transactionType>
    ): Promise<void> {
        // 取引タイプに応じて、取引中止
        switch (params.typeOf) {
            case pecorinoapi.factory.transactionType.Deposit:
                await this.depositService.cancel({ transactionId: params.id });
                break;
            case pecorinoapi.factory.transactionType.Transfer:
                await this.transferService.cancel({ transactionId: params.id });
                break;
            case pecorinoapi.factory.transactionType.Withdraw:
                await this.withdrawService.cancel({ transactionId: params.id });
                break;

            default:
        }
    }

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
