const Prometheus = require('prom-client')
const express = require('express');
const http = require('http');
const https = require('https');

Prometheus.collectDefaultMetrics();

const requestHistogram = new Prometheus.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['code', 'handler', 'method'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
})

const requestTimer = (req, res, next) => {
  const path = new URL(req.url, `http://${req.hostname}`).pathname
  const stop = requestHistogram.startTimer({
    method: req.method,
    handler: path
  })
  res.on('finish', () => {
    stop({
      code: res.statusCode
    })
  })
  next()
}

const app = express();
const server = http.createServer(app)

// See: http://expressjs.com/en/4x/api.html#app.settings.table
const PRODUCTION = app.get('env') === 'production';

// Administrative routes are not timed or logged, but for non-admin routes, pino
// overhead is included in timing.
app.get('/ready', (req, res) => res.status(200).json({status:"ok"}));
app.get('/live', (req, res) => res.status(200).json({status:"ok"}));
app.get('/metrics', async (req, res, next) => {
  const metrics = await Prometheus.register.metrics();
  res.set('Content-Type', Prometheus.register.contentType)
  res.end(metrics);
})

// Time routes after here.
app.use(requestTimer);

// Log routes after here.
const pino = require('pino')({
  level: PRODUCTION ? 'info' : 'debug',
});
app.use(require('pino-http')({logger: pino}));

app.get('/', (req, res) => {
  // Use req.log (a `pino` instance) to log JSON:
  req.log.info({message: 'Hello from Node.js Starter Application! - JDS'});
  res.send('Hello from Node.js Starter Application! - JDS');
});

app.get('/posts', (req, res) => {
    const options = {
        hostname: 'jsonplaceholder.typicode.com',
        port: 443,
        path: '/posts',
        method: 'GET'
    };

    https.request(options, response => {
        let data = '';

        // A chunk of data has been received.
        response.on('data', chunk => {
            data += chunk;
        });



         // The whole response has been received.
        response.on('end', () => {
            if (response.statusCode >= 200 && response.statusCode < 300) {
                // Parse the JSON data
                const jsonData = JSON.parse(data);

                // Style the JSON data here
                // Format the JSON data with paragraphs
                const formattedData = jsonData.map(post => (
                    `<p><strong>User ID:</strong> ${post.userId}</p>` +
                    `<p><strong>ID:</strong> ${post.id}</p>` +
                    `<p><strong>Title:</strong> ${post.title}</p>` +
                    `<p><strong>Body:</strong> ${post.body}</p><br>`
                )).join('');

                // Send the formatted JSON data as HTML response
                res.send(`<div>${formattedData}</div>`);
                
            } else {
                // If response status code is not in 200 range, send error message
                res.status(response.statusCode).json({ message: `Error: ${response.statusCode}` });
            }
        });
        
    }).on('error', error => {
        res.status(500).json({ message: error.message });
    }).end();
});

app.get('*', (req, res) => {
  res.status(404).send("Not Found");
});

// Listen and serve.
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`App started on PORT ${PORT}`);
});
