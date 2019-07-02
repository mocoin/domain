/**
 * 取引サービスユーティリティ
 */
import * as factory from '@mocoin/factory';
import * as jwt from 'jsonwebtoken';
import * as moment from 'moment';

export type ITransaction = factory.transaction.ITransaction<factory.transactionType>;
export async function sign<T extends ITransaction>(
    payload: T
): Promise<factory.transaction.ITokenizedTransaction> {
    const token = await new Promise<string>((resolve, reject) => {
        jwt.sign(
            payload,
            <string>process.env.MOCOIN_TOKEN_SECRET,
            {
                issuer: <string>process.env.MOCOIN_TOKEN_ISSUER,
                expiresIn: moment(payload.expires).diff(moment(), 'seconds')
            },
            (err, encoded) => {
                if (err instanceof Error) {
                    reject(err);
                } else {
                    resolve(encoded);
                }
            }
        );
    });

    return { token };
}
export async function verify<T extends ITransaction>(
    params: factory.transaction.ITokenizedTransaction
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        jwt.verify(params.token, <string>process.env.MOCOIN_TOKEN_SECRET, (err, decoded) => {
            if (err instanceof Error) {
                reject(err);
            } else {
                resolve(<T>decoded);
            }
        });
    });
}
