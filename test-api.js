const http = require('http');

function testAPI(method, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: method,
      headers: {
        'Authorization': 'Bearer test-token'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: data ? JSON.parse(data) : null
        });
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

async function test() {
  try {
    console.log('Testing: GET /api/time/activity-categories');
    const result = await testAPI('GET', '/api/time/activity-categories');
    console.log('Status:', result.status);
    console.log('Response:', JSON.stringify(result.body, null, 2).substring(0, 200));
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}

test();
