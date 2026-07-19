const { RESP_TYPES } = require('redis');
const { pack, unpack } = require('msgpackr');
const axios = require('./axios.js');
const RedisClient = require('./redis.js');

const UPSTREAM_URL = 'https://map.meshcore.dev/api/v1/nodes?binary=1&short=1';
const REDIS_KEYS = { all: 'mmc:nodes:all', pl: 'mmc:nodes:pl' };
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// Uproszczony poligon granic Polski [lon, lat] (źródło: https://raw.githubusercontent.com/johan/world.geo.json/master/countries/POL.geo.json)
const POLAND_POLYGON = [
	[15.016996, 51.106674], [14.607098, 51.745188], [14.685026, 52.089947], [14.4376, 52.62485],
	[14.074521, 52.981263], [14.353315, 53.248171], [14.119686, 53.757029], [14.8029, 54.050706],
	[16.363477, 54.513159], [17.622832, 54.851536], [18.620859, 54.682606], [18.696255, 54.438719],
	[19.66064, 54.426084], [20.892245, 54.312525], [22.731099, 54.327537], [23.243987, 54.220567],
	[23.484128, 53.912498], [23.527536, 53.470122], [23.804935, 53.089731], [23.799199, 52.691099],
	[23.199494, 52.486977], [23.508002, 52.023647], [23.527071, 51.578454], [24.029986, 50.705407],
	[23.922757, 50.424881], [23.426508, 50.308506], [22.51845, 49.476774], [22.776419, 49.027395],
	[22.558138, 49.085738], [21.607808, 49.470107], [20.887955, 49.328772], [20.415839, 49.431453],
	[19.825023, 49.217125], [19.320713, 49.571574], [18.909575, 49.435846], [18.853144, 49.49623],
	[18.392914, 49.988629], [17.649445, 50.049038], [17.554567, 50.362146], [16.868769, 50.473974],
	[16.719476, 50.215747], [16.176253, 50.422607], [16.238627, 50.697733], [15.490972, 50.78473],
	[15.016996, 51.106674],
];

// Test punktu w wielokącie metodą ray-casting
const isInPoland = node => {
	const { lat, lon } = node;
	let inside = false;
	for (let i = 0, j = POLAND_POLYGON.length - 1; i < POLAND_POLYGON.length; j = i++) {
		const [xi, yi] = POLAND_POLYGON[i];
		const [xj, yj] = POLAND_POLYGON[j];
		const intersects = yi > lat !== yj > lat && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi;
		if (intersects) inside = !inside;
	}
	return inside;
};

let lastRefreshedAt = null;

const refreshNodes = async () => {
	try {
		const { data } = await axios.get(UPSTREAM_URL, { responseType: 'arraybuffer' });
		const allBuffer = Buffer.from(data);
		const plBuffer = pack(unpack(allBuffer).filter(isInPoland));

		await Promise.all([
			RedisClient.set(REDIS_KEYS.all, allBuffer),
			RedisClient.set(REDIS_KEYS.pl, plBuffer),
		]);

		lastRefreshedAt = new Date();
		console.log(`[nodes] Cache refreshed (all: ${allBuffer.byteLength} bytes, pl: ${plBuffer.byteLength} bytes)`);
	} catch (err) {
		console.error('[nodes] Failed to refresh cache:', err.message || err.stack);
	}
};

const getCachedNodes = (region = 'pl') => RedisClient.withTypeMapping({ [RESP_TYPES.BLOB_STRING]: Buffer }).get(REDIS_KEYS[region] || REDIS_KEYS.pl);

const getLastRefreshedAt = () => lastRefreshedAt;

const startNodesRefreshJob = () => {
	void refreshNodes();
	setInterval(refreshNodes, REFRESH_INTERVAL_MS);
};

module.exports = { refreshNodes, getCachedNodes, getLastRefreshedAt, startNodesRefreshJob };
