import { createClient } from 'redis';

const client = createClient({
    username: 'default',
    password: 'o0EjuPkv0vCmo25LodqPxQMBvKDjzMpD',
    socket: {
        host: 'redis-16597.c328.europe-west3-1.gce.cloud.redislabs.com',
        port: 16597
    }
});

client.on('error', err => console.log('Redis Client Error', err));

await client.connect();

await client.set('foo', 'bar');
const result = await client.get('foo');
console.log(result)  // >>> bar

