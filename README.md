# claude-code-advanced-tool-use

Local proxy server to test Anthropic's Advanced Tool Use features in Claude Code.

## Background

Anthropic released [Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use) with Opus 4.5 (2025-11-24):

- **Tool Search Tool**: Discover tools on-demand instead of loading them all upfront
- **Programmatic Tool Calling**: Orchestrate tools through code execution
- **Tool Use Examples**: Provide sample tool calls in definitions

These are API-level features not yet available in Claude Code. This proxy intercepts API requests and adds the parameters to enable tool search.

The code execution tool was tested but disabled due to frequent parameter type errors.

## Setup

1. Install and run:
```bash
npm install
npm start
```

2. Add to `~/.claude/settings.json`:
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:3456"
  }
}
```

3. Run Claude Code.

## Review

### Nice

- Works well! Even with 100+ tools registered that occupy the entire context window, it dynamically discovered tools to use.
- All tool info is passed via API parameters, so Claude selects and invokes tools dynamically. More seamless than the query → discover → use pattern.
  - If you want to see how it works, try tracking `server_tool_use` from responses and `tool_use` from requests.
- `tool_search_tool_bm25` finds tools well even without vector embeddings.

### Bad

- Bugs often occur since this enables unsupported features via API hooking. The API itself is also in beta.
- Claude tends to use alternatives unless explicitly told to use a specific tool (e.g., uses `gh` CLI instead of searching GitHub MCP tools).
- Asking Claude to find MCP tools sometimes loads all related tool contexts, causing context window overflow.

## Usage Patterns

- Add instructions in `CLAUDE.md` to use tool search for common tasks.
- Mention task-specific tools in slash commands and subagent prompts.

## Existing Alternatives

MCP tool hubs: mcphub, toolhive, 1mcp, mcp-gateway, etc.

