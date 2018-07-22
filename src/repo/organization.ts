import * as factory from '@mocoin/factory';
// import * as createDebug from 'debug';
import { Connection } from 'mongoose';
import organizationModel from './mongoose/model/organization';

// const debug = createDebug('mocoin-domain:repository:organization');

export type IOrganization<T> =
    T extends factory.organizationType.Corporation ? factory.organization.corporation.IOrganization :
    factory.organization.IOrganization;

/**
 * 組織リポジトリー
 */
export class MongoRepository {
    public readonly organizationModel: typeof organizationModel;

    constructor(connection: Connection) {
        this.organizationModel = connection.model(organizationModel.modelName);
    }

    /**
     * find a movie theater by id
     * IDで劇場組織を取得する
     * @param id organization id
     */
    public async findById<T extends factory.organizationType>(
        typeOf: T,
        id: string
    ): Promise<IOrganization<T>> {
        const doc = await this.organizationModel.findOne({
            typeOf: typeOf,
            _id: id
        }).exec();

        if (doc === null) {
            throw new factory.errors.NotFound('organization');
        }

        return doc.toObject();
    }
}
