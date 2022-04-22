const got = require('@/utils/got');
const config = require('@/config').value;
const logger = require('@/utils/logger');
const LZString = require('lz-string');

module.exports = async (ctx) => {
    const device_id = config.xiaoyuzhou.device_id || '567A4582-7D55-4E67-928F-40DD3BF634E7';
    const refresh_token =
        (await ctx.cache.get('XIAOYUZHOU_TOKEN')) ||
        config.xiaoyuzhou.refresh_token ||
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjoiRVNwemdFa0I5dFwvXC9nMnJtWlkydVhWaWRJdXNNWDBoUDhZQUw3ZFFiZTRWZEllZjhza205ellvWFFsWGFYdGhpa2lmd1BBXC9CU1RZUVkrdGpWaFwvdWhNZlNBeXJ6anJEMXoxRGtJdDBScVFWTDcrZ2M3aGdyellzYU5PRFwvWDFaa0pTTnE2TGp5a0wwcWxQR2J3dm5NbmhyMXorbXMxNFp0aW41VmQrVzRJZ0VkSUlpM2o5VzJxM0dYWHZsSTJ2YXNrd1FwSnFpUll5MSs2UmpoWXBYZStmTUdcL2hYbG9SS05wNWJhNFBMelc2aDdjeWdvZlB6aEtiYXlnWU9zV0RFYSIsInYiOjMsIml2IjoiakZMMW1Id2xnb091aHhPaWZ1U3huUT09IiwiaWF0IjoxNjUwNTU1OTU0LjQ0MX0.7A70yLbk_v_K__IBUhY3w9nPOfAWewa9lmTLx4sxNLk';

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
    const next = ctx.params.next;
    const pid = ctx.params.id;
    logger.info(JSON.stringify(ctx.params));

    const token_updated = await got({
        method: 'post',
        url: 'https://api.xiaoyuzhoufm.com/app_auth_tokens.refresh',
        headers: {
            ...headers,
            'x-jike-refresh-token': refresh_token,
        },
    });
    ctx.cache.set('XIAOYUZHOU_TOKEN', token_updated.data['x-jike-refresh-token']);
    logger.info(JSON.stringify(token_updated.data));

    const limit = await got.get(`https://api.xiaoyuzhoufm.com/v1/podcast/get?pid=${ctx.params.id}`, {
        headers: {
            ...headers,
            'x-jike-access-token': token_updated.data['x-jike-access-token'],
        },
    });
    const limitdata = limit.data.data;
    logger.info(JSON.stringify(limitdata));
    const query = ctx.query.limit;
    const count = limitdata.episodeCount || 1000;
    const title = limitdata.title;
    const author = limitdata.author;
    const picUrl = limitdata.image.picUrl;
    const description = limitdata.description;
    logger.info(count);

    let loadMoreKey = next == null ? {} : JSON.parse(LZString.decompressFromBase64(next));
    logger.info("loadmore: " + JSON.stringify(loadMoreKey));
    const body = next == null ? JSON.stringify({
        "pid": ctx.params.id,
        "limit": 2000,
    }) : JSON.stringify({
        "pid": ctx.params.id,
        "limit": 20,
        "loadMoreKey": loadMoreKey,
    });

    const response = await got.post('https://api.xiaoyuzhoufm.com/v1/episode/list', {
        headers: {
            ...headers,
            'x-jike-access-token': token_updated.data['x-jike-access-token'],
        },
        body: body,
    });
    const data = response.data.data;
    loadMoreKey = response.data.loadMoreKey;

    let alldata = [...data];
    logger.info(`request ${query} items.`)
    while (query && (query == 'all' || alldata.length < query) && loadMoreKey != null) {
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
    const nextLoadMore = loadMoreKey == null ? null : LZString.compressToBase64(JSON.stringify(loadMoreKey));
    logger.info("nextloadmore " + JSON.stringify(response.data.loadMoreKey));
    const podcaststr = 'podcast';
    const hrefUrl = ctx.request.href.substring(0, ctx.request.href.indexOf(podcaststr) + podcaststr.length);
    logger.info(`next ${hrefUrl}/${pid}/${nextLoadMore}`);
    logger.info(alldata.length + ' items loaded.');
    const episodes = alldata.map((item) => ({
        title: item.title,
        enclosure_url: item.enclosure.url,
        enclosure_length: item.duration,
        enclosure_type: 'audio/mpeg',
        link: `https://www.xiaoyuzhoufm.com/episode/${item.eid}`,
        pubDate: new Date(item.pubDate).toUTCString(),
        description: item.shownotes,
        itunes_item_image: picUrl,
    }));

    ctx.state.data = {
        title,
        link: `https://www.xiaoyuzhoufm.com/podcast/${ctx.params.id}`,
        itunes_author: author,
        next: nextLoadMore != null ? encodeURI(`${hrefUrl}/${pid}/${nextLoadMore}`) : null,
        itunes_category: 'Leisure',
        image: picUrl,
        item: episodes,
        description,
    };
};
