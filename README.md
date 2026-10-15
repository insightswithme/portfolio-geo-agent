# Portfolio Geographic Extractor

Optimizely Opal agent and custom tool that read a portfolio page and return the countries and states actually mentioned in it, each with the sentence it came from.

The agent definition is `agent/portfolio_geo_agent.json`. The tool server exposes Opal discovery at `GET /discovery` and execution at `POST /tools/fetch-portfolio-geo-data`.

## Run the tool

```powershell
copy .env.example .env
```

Set `OPAL_TOOL_SECRET` in `.env` to a random string of at least 16 characters. Then:

```powershell
npm install
npm test
npm run dev
```

The server listens on port 4000. Discovery is public. Tool calls require `Authorization: Bearer <OPAL_TOOL_SECRET>`.

`ALLOWED_HOSTS` limits which sites the tool will fetch. Private and link-local addresses are blocked even if they appear in that list. Set `VERCEL_BYPASS_SECRET` only when the portfolio deployment uses Vercel Deployment Protection.

## Register it in Opal

Opal Cloud cannot call `localhost`. Deploy this server somewhere Opal can reach, then:

1. In Opal, go to **Settings → Tools → Add Tool → Custom Tool**.
2. Set the discovery URL to `https://<your-host>/discovery`.
3. Set the bearer token to the same value as `OPAL_TOOL_SECRET`.
4. Go to **Agents → Add Agent → Upload Agent** and upload `agent/portfolio_geo_agent.json`.
5. In chat, run `@portfolio_geo_agent` with the portfolio URL.

If the live URL still returns the Vercel login page, paste the page text into the chat. The agent calls the tool again with `pageText` and skips the fetch.

## Tool response

A successful call returns `status: "ok"` and a `matches` array. Each match has `kind` (`country` or `state`), `name`, `iso2`, `matchedText`, and `context`. State matches also include `stateCode` and `parentCountry`. `auth_required` means the URL needs a public deployment, a bypass secret, or pasted text.
