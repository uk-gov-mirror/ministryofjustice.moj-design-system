// Core dependencies
const fs = require('fs');
const path = require('path');

// NPM dependencies
const browserSync = require('browser-sync');
const express = require('express');
const dotenv = require('dotenv');
const nunjucks = require('nunjucks');
const markdown = require('nunjucks-markdown');
const sessionInMemory = require('express-session');
const bodyParser = require('body-parser');
const marked = require('marked');
const fileHelper = require('./app/utils/file-helper');
const NunjucksCodeHighlight = require('nunjucks-highlight.js');
const hljs = require('highlight.js');
const highlight = new NunjucksCodeHighlight(nunjucks, hljs);

let sessionOptions = {
  secret: 'moj-frontend'
};

// Run before other code to make sure variables from .env are available
dotenv.config();

// Routing
const routes = require('./app/routes/index');
const multiFileUploadRoutes = require('./app/routes/multi-file-upload');
const autoRoutes = require('./app/routes/auto');

// Local dependencies
const utils = require('./lib/utils.js');

// Port
const port = process.env.PORT || 3000;

// Configuration
const env = process.env.NODE_ENV || 'development';
const useAuth = process.env.USE_AUTH || true;
const useHttps = process.env.USE_HTTPS || true;
const username = process.env.USERNAME;
const password = process.env.PASSWORD;
const useBrowserSync = process.env.USE_BROWSER_SYNC || true;

// env = env.toLowerCase();
// useAuth = useAuth.toLowerCase();
// useHttps = useHttps.toLowerCase();
// useBrowserSync = useBrowserSync.toLowerCase();

// Application
const app = express();

app.use(bodyParser.urlencoded({ extended: false }));

// Find a free port and start the server
utils.findAvailablePort(app, (port) => {
  console.log('Listening on port ' + port + ' url: http://localhost:' + port);
  if ((env === 'production' || env === 'staging') || useBrowserSync === 'false') {
    app.listen(port);
  } else {
    app.listen(port - 50, () => {
      browserSync({
        proxy: 'localhost:' + (port - 50),
        port: port,
        ui: false,
        files: ['public/**/*.*', 'app/views/**/*.*'],
        ghostmode: false,
        open: false,
        notify: false,
        logLevel: 'error'
      })
    })
  }
});

// Force HTTPS on production. Do this before using basicAuth to avoid
// asking for username/password twice (for `http`, then `https`).
if ((env === 'production' || env === 'staging') && useHttps === 'true') {
  app.use(utils.forceHttps);
  app.set('trust proxy', 1); // needed for secure cookies on heroku
}

// Ask for username and password on production
if ((env === 'production' || env === 'staging') && useAuth === 'true') {
  app.use(utils.basicAuth(username, password));
}

// Search engine indexing
if ((env === 'production' || env === 'staging') && useAuth === 'false') {
  // Allow search engines to index the site
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send('User-agent: *\nAllow: /');
  });
} else {
  // Prevent search indexing
  app.use((req, res, next) => {
    // Setting headers stops pages being indexed even if indexed pages link to them.
    res.setHeader('X-Robots-Tag', 'noindex');
    next();
  });

  app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send('User-agent: *\nDisallow: /');
  });
}

// Setup application
const appViews = [
  path.join(__dirname, '/node_modules/govuk-frontend/'),
  path.join(__dirname, '/node_modules/@ministryofjustice/frontend/'),
  path.join(__dirname, 'app/views'),
  path.join(__dirname, 'app/components')
];

// Configurations
const nunjucksEnvironment = nunjucks.configure(appViews, {
  autoescape: true,
  express: app,
  noCache: true,
  watch: true
});

nunjucksEnvironment.addGlobal('getNunjucksCode', fileHelper.getNunjucksCode);
nunjucksEnvironment.addGlobal('getHtmlCode', fileHelper.getHTMLCode);
nunjucksEnvironment.addGlobal('getCssCode', fileHelper.getCSSCode);
nunjucksEnvironment.addGlobal('getJsCode', fileHelper.getJSCode);
nunjucksEnvironment.addExtension('NunjucksCodeHighlight', highlight);

nunjucksEnvironment.addFilter('highlight', (code, language = '') => {
  const highlighted = hljs.highlight(code, { language }).value

  return new nunjucks.runtime.SafeString('<pre>' + highlighted + '</pre>');
})

// Add filters from MOJ Frontend
let mojFilters = require('./node_modules/@ministryofjustice/frontend/moj/filters/all')();
mojFilters = Object.assign(mojFilters);
Object.keys(mojFilters).forEach(function (filterName) {
  nunjucksEnvironment.addFilter(filterName, mojFilters[filterName])
});

// Set view engine
app.set('view engine', 'html');

// Middleware to serve static assets
app.use('/public', express.static(path.join(__dirname, '/public')));
app.use('/assets', express.static(path.join(__dirname, '/node_modules/govuk-frontend/govuk/assets')))
app.use('/assets', express.static(path.join(__dirname, '/node_modules/@ministryofjustice/frontend/moj/assets')));

app.use('/node_modules/govuk-frontend', express.static(path.join(__dirname, '/node_modules/govuk-frontend')));
app.use('/node_modules/moj-frontend', express.static(path.join(__dirname, '/node_modules/@ministryofjustice/frontend')));

app.use(sessionInMemory(Object.assign(sessionOptions, {
  name: 'moj-frontend',
  resave: false,
  saveUninitialized: false
})));

// Use routes
app.use(routes);
app.use(multiFileUploadRoutes);
app.use(autoRoutes);

const renderer = new marked.Renderer();

marked.setOptions({
  renderer: renderer,
  gfm: true,
  tables: true,
  breaks: true,
  pendantic: true,
  sanitize: false,
  smartLists: true,
  smartypants: true
});

// Markdown register
markdown.register(nunjucksEnvironment, marked);

const nodeModulesExists = fs.existsSync(path.join(__dirname, '/node_modules'));
if (!nodeModulesExists) {
  console.error('ERROR: Node module folder missing. Try running `npm install`');
  process.exit(0);
}

// Create template .env file if it doesn't exist
const envExists = fs.existsSync(path.join(__dirname, '/.env'));
if (!envExists) {
  fs.createReadStream(path.join(__dirname, '/lib/template.env'))
    .pipe(fs.createWriteStream(path.join(__dirname, '/.env')));
}

module.exports = app;
