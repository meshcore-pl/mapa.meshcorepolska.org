process.loadEnvFile();
const express = require('express');
const helmet = require('helmet');
const { version } = require('./package.json');
const { DOMAIN, NODE_ENV, PORT } = process.env;
const isProd = NODE_ENV === 'production';

// Fetch nodes on boot, then keep the Redis cache warm on an interval
const { startNodesRefreshJob } = require('./services/nodes.js');
startNodesRefreshJob();

// Middleware imports
const timeout = require('./middlewares/timeout.js');
const logger = require('./middlewares/morgan.js');
const globalLimiter = require('./middlewares/ratelimit.js');
const ApiError = require('./utils/httpError.js');

// Create an Express app
const app = express();

// Configure the app
if (isProd) app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.locals.domain = DOMAIN;
app.locals.version = version;

// Use middlewares
app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));
app.use(express.static('public'));
app.use(logger);
if (isProd) app.use(globalLimiter);
app.use(timeout());


// Routes
const IndexRouter = require('./routes/Index.js');
const APIRouter = require('./routes/Api.js');

app.use(IndexRouter);
app.use('/api/v1', APIRouter);


// Error handling
app.use((req, res) => ApiError(res, 404));
app.use((err, req, res, _next) => ApiError(res, 500, err));


// Start the server
app.listen(PORT, () => process.send ? process.send('ready') : console.log(`Server running at ${DOMAIN}:${PORT}`));
