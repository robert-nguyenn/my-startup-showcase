import { getSMA } from './controllers/technicalIndicators/technicalIndicators';
import { initRedis } from './utils/redisClient';

async function testCache() {

    initRedis()
  // 1st call: not cached, should fetch from Alpha Vantage
    const data1 = await getSMA('AAPL', 'monthly', '20', 'close');
    console.log('First call data:', data1);

  // 2nd call: same parameters, should return from Redis cache
    const data2 = await getSMA('AAPL', 'monthly', '20', 'close');
    console.log('Second call data:', data2);
}

testCache();