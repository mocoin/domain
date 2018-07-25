// tslint:disable:max-classes-per-file completed-docs
/**
 * index module
 */
import * as factory from '@mocoin/factory';
import * as pecorinoapi from '@pecorino/api-nodejs-client';
import * as AWS from 'aws-sdk';
import * as mongoose from 'mongoose';
import * as redis from 'redis';

import * as CoinAccountService from './service/account/coin';
import * as NotificationService from './service/notification';
import * as TaskService from './service/task';
import * as BuyCoinTransactionService from './service/transaction/buyCoin';
import * as DepositCoinTransactionService from './service/transaction/depositCoin';
import * as ReturnCoinTransactionService from './service/transaction/returnCoin';
import * as TransferCoinTransactionService from './service/transaction/transferCoin';
import * as WithdrawCoinTransactionService from './service/transaction/withdrawCoin';
import * as UtilService from './service/util';

import { PecorinoRepository as CoinAccountRepo } from './repo/account/coin';
import { RedisRepository as AccountNumberRepo } from './repo/accountNumber';
import { MongoRepository as ActionRepo } from './repo/action';
import { MongoRepository as OrderRepo } from './repo/order';
import { RedisRepository as OrderNumberRepo } from './repo/orderNumber';
import { MongoRepository as OrganizationRepo } from './repo/organization';
import { MongoRepository as OwnershipInfoRepo } from './repo/ownershipInfo';
import { PecorinoRepository as BankAccountPaymentRepo } from './repo/paymentMethod/bankAccount';
import { CognitoRepository as PersonRepo } from './repo/person';
import { MongoRepository as SendGridEventRepo } from './repo/sendGridEvent';
import { MongoRepository as TaskRepo } from './repo/task';
import { MongoRepository as TelemetryRepo } from './repo/telemetry';
import { MongoRepository as TransactionRepo } from './repo/transaction';

/**
 * MongoDBクライアント`mongoose`
 * @example
 * var promise = mocoin.mongoose.connect('mongodb://localhost/myapp', {
 *     useMongoClient: true
 * });
 */
export import mongoose = mongoose;
/**
 * Redis Cacheクライアント
 */
export import redis = redis;
/**
 * Pecorino APIクライアント
 * Pecorinoサービスとの連携は全てこのクライアントを通じて行います。
 */
export import pecorinoapi = pecorinoapi;
/**
 * AWS SDK
 */
export import AWS = AWS;

export namespace repository {
    export namespace account {
        export class Coin extends CoinAccountRepo { }
    }
    export namespace paymentMethod {
        export class BankAccount extends BankAccountPaymentRepo { }
    }
    export class AccountNumber extends AccountNumberRepo { }
    export class Action extends ActionRepo { }
    export namespace action {
    }
    export class Order extends OrderRepo { }
    export class OrderNumber extends OrderNumberRepo { }
    export class Organization extends OrganizationRepo { }
    export class OwnershipInfo extends OwnershipInfoRepo { }
    export class Person extends PersonRepo { }
    export class SendGridEvent extends SendGridEventRepo { }
    export class Task extends TaskRepo { }
    export class Telemetry extends TelemetryRepo { }
    export class Transaction extends TransactionRepo { }

    export namespace itemAvailability {
    }
}

export namespace service {
    export namespace account {
        export import coin = CoinAccountService;
    }
    export import notification = NotificationService;
    export namespace person {
    }
    export import task = TaskService;
    export namespace transaction {
        export import buyCoin = BuyCoinTransactionService;
        export import depositCoin = DepositCoinTransactionService;
        export import returnCoin = ReturnCoinTransactionService;
        export import transferCoin = TransferCoinTransactionService;
        export import withdrawCoin = WithdrawCoinTransactionService;
    }
    export import util = UtilService;
}

export import factory = factory;
