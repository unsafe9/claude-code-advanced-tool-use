const express = require('express');

const app = express();
app.use(express.json({ limit: '50mb' }));

// often causes an error due to the wrong parameter type, so it is disabled.
const useCodeExecutionTool = true;

function buildUrl(path, originalUrl, beta = true) {
    const url = new URL(originalUrl, 'http://localhost');
    if (beta) {
        url.searchParams.set('beta', 'true');
    }
    return `https://api.anthropic.com${path}${url.search}`;
}

// fix an issue where server_tool_use.input is not a valid dictionary
function fixServerToolUseInput(body) {
    if (!body?.messages || !Array.isArray(body.messages)) {
        return;
    }

    for (const message of body.messages) {
        if (!message?.content || !Array.isArray(message.content)) {
            continue;
        }

        for (const block of message.content) {
            if (block?.type === 'server_tool_use') {
                if (block.input === null || block.input === undefined) {
                    block.input = {};
                } else if (typeof block.input === 'string') {
                    try {
                        block.input = JSON.parse(block.input);
                    } catch {
                        block.input = {};
                    }
                } else if (typeof block.input !== 'object' || Array.isArray(block.input)) {
                    block.input = {};
                }
            }
        }
    }
}

function modifyBody(body, addBetaTools = true) {
    if (!body || typeof body !== 'object') {
        return;
    }

    fixServerToolUseInput(body);

    let { model, tools, mcp_servers } = body;
    if (model?.includes('haiku')) {
        return;
    }

    if (!tools) {
        body.tools = [];
        tools = body.tools;
    }

    for (const tool of tools) {
        if (tool.name?.startsWith('mcp__')) {
            tool['defer_loading'] = true;
        }
        if (useCodeExecutionTool) {
            tool['allowed_callers'] = (tool['allowed_callers'] || []).concat(['code_execution_20250825']);
        }
    }

    if (mcp_servers && Array.isArray(mcp_servers)) {
        for (const server of mcp_servers) {
            if (!server.name) {
                continue
            }
            tools.unshift({
                type: "mcp_toolset",
                mcp_server_name: server.name,
                default_config: {
                    defer_loading: true,
                }
            });
        }
    }

    if (addBetaTools) {
        // bm25 works better than regex for most cases
        tools.unshift({
            type: "tool_search_tool_bm25_20251119",
            name: "tool_search_tool_bm25",
        });
        if (useCodeExecutionTool) {
            tools.unshift({
                "type": "code_execution_20250825",
                "name": "code_execution",
            });
        }
    }
}

const BETA_FLAGS = 'advanced-tool-use-2025-11-20,mcp-client-2025-11-20';

function modifyHeaders(reqHeaders) {
    const headers = { ...reqHeaders };
    const existing = headers['anthropic-beta'] || '';
    if (!existing.includes(BETA_FLAGS)) {
        headers['anthropic-beta'] = existing ? `${existing},${BETA_FLAGS}` : BETA_FLAGS;
    }
    delete headers.host;
    delete headers['content-length'];
    return headers;
}

function pipeResponse(res, response) {
    res.status(response.status);
    for (const [k, v] of response.headers) {
        if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(k.toLowerCase())) {
            res.setHeader(k, v);
        }
    }
    response.body.pipe(res);
}

// Message API
app.post('/v1/messages', async (req, res) => {
    const body = req.body;

    modifyBody(body);
    const headers = modifyHeaders(req.headers);

    try {
        const response = await fetch(buildUrl(`/v1/messages`, req.originalUrl), {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        pipeResponse(res, response);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Token Count API
app.post('/v1/messages/count_tokens', async (req, res) => {
    const body = req.body;

    modifyBody(body, false);
    const headers = modifyHeaders(req.headers);

    try {
        const response = await fetch(buildUrl(`/v1/messages/count_tokens`, req.originalUrl), {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        pipeResponse(res, response);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Message Batch API
app.post('/v1/messages/batches', async (req, res) => {
    const body = req.body;

    if (body.requests) {
        for (const request of body.requests) {
            modifyBody(request.params);
        }
    }
    const headers = modifyHeaders(req.headers);

    try {
        const response = await fetch(buildUrl(`/v1/messages/batches`, req.originalUrl), {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        pipeResponse(res, response);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bypass for other endpoints
app.all('/*', async (req, res) => {
    const headers = modifyHeaders(req.headers);

    try {
        const response = await fetch(buildUrl('', req.originalUrl, false), {
            method: req.method,
            headers,
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body)
        });
        pipeResponse(res, response);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(3456, () => console.log('Proxy on http://localhost:3456'));
