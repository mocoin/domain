# Mocoin Domain Library for Node.js

[![Coverage Status](https://coveralls.io/repos/github/mocoin/domain/badge.svg?branch=master)](https://coveralls.io/github/mocoin/domain?branch=master)

Mocoinのバックエンドサービスをnode.jsで簡単に使用するためのパッケージを提供します。

## Table of contents

* [Usage](#usage)
* [Code Samples](#code-samples)
* [License](#license)

## Usage

```shell
npm install @mocoin/domain
```

### Environment variables

| Name                                 | Required | Value           | Purpose            |
|--------------------------------------|----------|-----------------|--------------------|
| `DEBUG`                              | false    | mocoin-domain:* | Debug              |
| `NPM_TOKEN`                          | true     |                 | NPM auth token     |
| `NODE_ENV`                           | true     |                 | environment name   |
| `SENDGRID_API_KEY`                   | true     |                 | SendGrid API Key   |
| `DEVELOPER_LINE_NOTIFY_ACCESS_TOKEN` | true     |                 | 開発者通知用LINEアクセストークン |
| `WAITER_SECRET`                      | true     |                 | WAITER許可証トークン秘密鍵   |
| `WAITER_PASSPORT_ISSUER`             | true     |                 | WAITER許可証発行者       |
| `ORDER_INQUIRY_ENDPOINT`             | true     |                 | 注文照会エンドポイント        |

### DB接続サンプル

```js
const mocoin = require('@mocoin/domain');

mocoin.mongoose.connect('MONGOLAB_URI');
const redisClient = mocoin.redis.createClient({
    host: '*****',
    port: 6380,
    password: '*****',
    tls: { servername: 6380 }
});
```

## Code Samples

Code sample are [here](https://github.com/mocoin/domain/tree/master/example).

## License

ISC
