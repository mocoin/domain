/**
 * 口座番号発行サンプル
 * @ignore
 */
const moment = require('moment');
const sskts = require('../');

async function main() {
    let redisClient;
    try {
        redisClient = sskts.redis.createClient({
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT, 10),
            password: process.env.REDIS_KEY,
            tls: { servername: process.env.REDIS_HOST }
        });

        const accountNubmerRepo = new sskts.repository.AccountNumber(redisClient);
        const accountNumber = await accountNubmerRepo.publish(new Date());
        console.log('accountNumber published.', accountNumber);
    } catch (error) {
        console.error(error);
    }

    redisClient.quit();
}

main().then(() => {
    console.log('success!');
}).catch((err) => {
    console.error(err);
    process.exit(1);
});
