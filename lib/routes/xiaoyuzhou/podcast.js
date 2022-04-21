const got = require('@/utils/got');
const config = require('@/config').value;
const logger = require('@/utils/logger');
const LZString = require('lz-string');

module.exports = async (ctx) => {
    const device_id = config.xiaoyuzhou.device_id || '567A4582-7D55-4E67-928F-40DD3BF634E7';
    const refresh_token =
        (await ctx.cache.get('XIAOYUZHOU_TOKEN')) ||
        config.xiaoyuzhou.refresh_token ||
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjoidmhWQnVUWHI1bmlpV2VUNWhpOWpKTHBldXhhaXQweHBYRThGUmdmc2FsKzl3Yk9LYUNZNmpTdncxeU80TGZmaHhXNXhVOXl4NXpWeUZDUHlucWhHcmMzRjNSeDJzWllkcld6Zm5OSEpBak4rVzJ4ZCtIMzhMNXlTOTdnMVYxbzBxajd1bVVkV0k3REF0TlJWblIyOU1lZnlBVkNIdDVtUDJMVUZ6ZzVHWUFseFdIdU9RYUxibGxQSnlWQUkydVFqcUJadnhQTk1IRVF5Vno3dVNCUlcxcWtySUo1K0NpT1BjVFF0aGRVd0JoM3E2c3U5YkhCSGVVZ3MzNWUyNVwvb3ZwSHJ0QVhOTGF3YUk5RUpWYWh5d1ZRd2VYZnhacGNrQm1mcEp3UGhzN0RjWWhFRXVPT3RUY2ptWGtieHptRnRHTkdMMExvQ3RyR3ppWmtcL2twOU0xYnMxSUFyQXRXUnBzV1ZjYXpWNGtQUlFmQU9HQ1wvc215YXBXUXRtYmErV3djZnFZQ3E5MUZYb0J0ZkI0bmlndDBWRjVQNjMxTVgrU1I3Z3QyQTgzdHU5YXZMZmtQcVhqeWtXQ0oxb2VENzFYUiIsInYiOjMsIml2IjoiUlZiNWZ6U3hPVFVTa3NieGJFZkxEUT09IiwiaWF0IjoxNjUwNTQ2ODQ3Ljg3M30.VH0FC5-v0fEk_i7q8OtJzRkCljT4xeXK8rFmrX_3Ik8';

    const headers = {
        'User-Agent': 'Xiaoyuzhou/2.25 (build:782; iOS 15.4.1)',
        'x-jike-device-id': device_id,
        'OS': 'ios',
        'Manufacturer': 'Apple',
        'BundleID': 'app.podcast.cosmos',
        'Connection': 'keep-alive',
        'Accept-Language': 'zh-Hans-CN;q=1.0',
        'Model': 'iPhone13,3',
        'app-permissions': '4',
        'Accept': '*/*',
        'Content-Type': 'application/json',
        'OS-Version': '15.4.1',
        'App-Version': '2.25',
        'WifiConnected': 'true'
    };

    const token_updated = await got({
        method: 'post',
        url: 'https://api.xiaoyuzhoufm.com/app_auth_tokens.refresh',
        headers: {
            ...headers,
            'x-jike-refresh-token': refresh_token,
        },
    });
    ctx.cache.set('XIAOYUZHOU_TOKEN', token_updated.data['x-jike-access-token']);
    logger.info(JSON.stringify(token_updated.data));

    const limit = await got.get(`https://api.xiaoyuzhoufm.com/v1/podcast/get?pid=${ctx.params.id}`, {
        headers: {
            ...headers,
            'x-jike-access-token': token_updated.data['x-jike-access-token'],
        },
    });
    const limitdata = limit.data.data;
    logger.info(JSON.stringify(limitdata));

    const count = limitdata.episodeCount || 1000;
    const title = limitdata.title;
    const author = limitdata.author;
    const picUrl = limitdata.image.picUrl;
    const description = limitdata.description;
    logger.info(count);

    const time = ctx.params.time;
    // const loadMoreKey = time == null ? {} : { 
    //     'pid': ctx.params.id, 
    //     'pubDate': LZString.decompressFromBase64(time),
    //     "direction": "next",
    // };
    // logger.info(JSON.stringify(loadMoreKey));
    const response = await got.post('https://api.xiaoyuzhoufm.com/v1/episode/list', {
        headers: {
            ...headers,
            'x-jike-access-token': token_updated.data['x-jike-access-token'],
        },
        body: JSON.stringify({
            "pid": ctx.params.id,
            "limit": 20,
            // ...loadMoreKey,
        }),
    });
    const data = response.data.data;
    const nextLoadMore = response.data.loadMoreKey == null ? null : response.data.loadMoreKey.pubDate;
    let loadMoreKey = response.data.loadMoreKey;
    let alldata = [...data];
    while (loadMoreKey) {
        const res = await got.post('https://api.xiaoyuzhoufm.com/v1/episode/list', {
            headers: {
                ...headers,
                'x-jike-access-token': token_updated.data['x-jike-access-token'],
            },
            body: JSON.stringify({
                "pid": ctx.params.id,
                "limit": 20,
                loadMoreKey,
            }),
        });
        alldata = [...alldata, ...res.data.data];
        loadMoreKey = res.data.loadMoreKey;
    }
    // const alldata = data;
    // const podcaststr = 'podcast';
    // const hrefUrl = ctx.request.href.substring(0, ctx.request.href.indexOf(podcaststr) + podcaststr.length);
    // logger.info(`next ${hrefUrl}/${LZString.compressToBase64(nextLoadMore)}`);
    logger.info(alldata.length + ' items loaded.');
    const episodes = alldata.map((item) => ({
        title: item.title,
        enclosure_url: item.enclosure.url,
        enclosure_length: item.duration,
        enclosure_type: 'audio/mpeg',
        link: `https://www.xiaoyuzhoufm.com/episode/${item.eid}`,
        pubDate: new Date(item.pubDate).toUTCString(),
        description: item.shownotes,
        itunes_item_image: item.picUrl,
    }));

    ctx.state.data = {
        title,
        link: `https://www.xiaoyuzhoufm.com/podcast/${ctx.params.id}`,
        itunes_author: author,
        // next: nextLoadMore != null ? encodeURI(`${hrefUrl}/${LZString.compressToBase64(nextLoadMore)}`) : null,
        itunes_category: 'Leisure',
        image: picUrl,
        item: episodes,
        description,
    };
};
