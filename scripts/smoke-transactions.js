const crypto = require('crypto');

function getApiBaseUrl() {
    const rawBase = String(process.env.API_BASE_URL || process.env.APP_BASE_URL || 'https://finance-tracker-nine-bice.vercel.app').trim();
    const normalizedBase = rawBase.replace(/\/+$/, '');
    return normalizedBase.endsWith('/api') ? normalizedBase : `${normalizedBase}/api`;
}

async function parseJsonResponse(response) {
    const text = await response.text();
    if (!text) return {};

    try {
        return JSON.parse(text);
    } catch {
        return { msg: text };
    }
}

async function requestJson(url, options) {
    const response = await fetch(url, options);
    const data = await parseJsonResponse(response);

    if (!response.ok) {
        throw new Error(data.msg || data.message || `Request failed (${response.status})`);
    }

    return data;
}

async function main() {
    const apiBaseUrl = getApiBaseUrl();
    const uniqueId = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const email = `smoke-${uniqueId}@example.com`;
    const password = 'SmokeTest123';
    const authHeaders = { 'Content-Type': 'application/json' };

    console.log(`Using API base: ${apiBaseUrl}`);
    console.log(`Creating temporary account: ${email}`);

    const registerResult = await requestJson(`${apiBaseUrl}/auth/register`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
            name: 'Smoke Test User',
            email,
            password,
            country: 'Kenya',
            phoneNumber: '+254700000000'
        })
    });

    const token = registerResult.token;
    if (!token) {
        throw new Error('Registration did not return an auth token.');
    }

    const transactionPayload = {
        type: 'expense',
        category: 'Smoke Test',
        amount: 123.45,
        date: new Date().toISOString().slice(0, 10),
        description: 'Deployment smoke test transaction'
    };

    const createdTransaction = await requestJson(`${apiBaseUrl}/transactions`, {
        method: 'POST',
        headers: {
            ...authHeaders,
            'x-auth-token': token
        },
        body: JSON.stringify(transactionPayload)
    });

    if (!createdTransaction._id) {
        throw new Error('Transaction create response did not include an id.');
    }

    const listedTransactions = await requestJson(`${apiBaseUrl}/transactions`, {
        method: 'GET',
        headers: {
            'x-auth-token': token
        }
    });

    if (!Array.isArray(listedTransactions)) {
        throw new Error('Transaction list response was not an array.');
    }

    const match = listedTransactions.find((transaction) => transaction && transaction._id === createdTransaction._id);
    if (!match) {
        throw new Error('Created transaction was not returned by GET /transactions.');
    }

    await requestJson(`${apiBaseUrl}/transactions/${createdTransaction._id}`, {
        method: 'DELETE',
        headers: {
            'x-auth-token': token
        }
    });

    console.log('Smoke test passed: create, list, and delete transaction flow is working.');
}

main().catch((error) => {
    console.error(`Smoke test failed: ${error.message}`);
    process.exitCode = 1;
});