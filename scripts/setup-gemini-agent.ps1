$ErrorActionPreference = 'Stop'

Write-Host '=== Sashka Molodets · Gemini coding-agent setup ===' -ForegroundColor Cyan
Write-Host 'This installs project-local Gemini documentation MCP + Gemini API skills.'
Write-Host 'It does NOT change API quotas or billing.' -ForegroundColor Yellow

Write-Host "`n[1/4] Gemini Docs MCP" -ForegroundColor Cyan
npx add-mcp "https://gemini-api-docs-mcp.dev"

Write-Host "`n[2/4] gemini-api-dev skill" -ForegroundColor Cyan
npx skills add google-gemini/gemini-skills --skill gemini-api-dev

Write-Host "`n[3/4] gemini-interactions-api skill" -ForegroundColor Cyan
npx skills add google-gemini/gemini-skills --skill gemini-interactions-api

Write-Host "`n[4/4] gemini-live-api-dev skill" -ForegroundColor Cyan
npx skills add google-gemini/gemini-skills --skill gemini-live-api-dev

Write-Host "`nDone." -ForegroundColor Green
Write-Host 'Restart Claude Code / Antigravity after installation so it re-indexes the skills.'
Write-Host 'Claude Code verification: /mcp then /skills'
Write-Host 'Antigravity verification: Customizations > Connections, then /skills list'
