const BASE_URL = 'http://localhost:3000/api/auth';
const TASKS_URL = 'http://localhost:3000/api/tasks';

async function run() {
    console.log('--- Auth Hardening Tests ---');

    // 1. Login
    const loginRes = await fetch(`${BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'password123' })
    });

    if (!loginRes.ok) {
        console.error('Login failed, user admin might not exist or wrong password');
        const text = await loginRes.text();
        console.error(text);
        return;
    }

    const tokens = await loginRes.json() as any;
    const { accessToken, refreshToken } = tokens;
    console.log('Login successful');

    // 2. Validate session with valid token
    const sessionRes = await fetch(`${BASE_URL}/session`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    console.log('Session with valid token:', sessionRes.status === 200 ? 'SUCCESS' : 'FAILED');

    // 4. Test Concurrency (Simulating multi-tabs / multiple failed requests at the exact same moment)
    console.log('\n--- Testing Concurrent Refreshes (Grace Window) ---');
    const [refresh1, refresh2] = await Promise.all([
        fetch(`${BASE_URL}/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
        }),
        fetch(`${BASE_URL}/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
        })
    ]);

    console.log(`Refresh 1 status: ${refresh1.status}`);
    console.log(`Refresh 2 status: ${refresh2.status}`);

    const body1 = await refresh1.text();
    const body2 = await refresh2.text();

    let newAccessToken = null;

    if (refresh1.status === 200) {
        const data = JSON.parse(body1);
        newAccessToken = data.accessToken;
        console.log('Refresh 1 succeeded');
    } else if (refresh2.status === 200) {
        const data = JSON.parse(body2);
        newAccessToken = data.accessToken;
        console.log('Refresh 2 succeeded');
    } else {
        console.log('Refresh 1 response:', body1);
        console.log('Refresh 2 response:', body2);
    }

    // 5. Verify session is still valid (No Wipe-Out occurred)
    if (newAccessToken) {
        const postRefreshSessionRes = await fetch(`${BASE_URL}/session`, {
            headers: { 'Authorization': `Bearer ${newAccessToken}` }
        });
        console.log('Post-Concurrent Refresh Session is:', postRefreshSessionRes.status === 200 ? 'VALID' : 'INVALID');
    } else {
        console.log('No new token acquired. Test failed or grace window rejected without token and none succeeded.');
    }

    console.log('\n--- Done ---');
}

run().catch(console.error);
