# Vercel / Supabase / Euria deployment

The repository is deployable on Vercel without a committed secrets file. Vercel runs `npm run build`, serves the Vite application, and deploys `api/draft.mjs` as the authenticated AI function.

## Required Vercel environment variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | build + runtime | Browser Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | build + runtime | Browser publishable key |
| `SUPABASE_URL` | server runtime | Server-side RPC URL |
| `SUPABASE_PUBLISHABLE_KEY` | server runtime | Server-side RPC key used with the caller JWT |
| `EURIA_API_KEY` | server runtime | Infomaniak AI Services API key |
| `EURIA_PRODUCT_ID` | server runtime | Infomaniak AI Services product ID |
| `EURIA_MODEL` | server runtime | A model ID confirmed by the product's `/models` endpoint |

Never expose `EURIA_API_KEY` in a `VITE_` variable. Do not use a Supabase service-role key for this application; the Vercel function forwards the caller's JWT to checked database RPCs.

## Deployment sequence

1. Create or select a Supabase project and apply `supabase/migrations` in filename order.
2. Configure Google OAuth in Supabase. Add the Supabase callback URL to Google and add the Vercel production URL to Supabase Auth redirect URLs.
3. Create an Infomaniak AI Services product. Use its OpenAI-compatible `/models` endpoint to choose a non-beta model with the required JSON output behavior and record its current price before enabling paid calls.
4. Set the variables above in Vercel from a credential manager. Do not place secrets in the repository or local `.env` files.
5. Deploy, then verify Google sign-in, invitation acceptance, two-session editing, a viewer's local-only simulation, and an owner/editor Euria proposal.

The function sends Euria only the latest project document returned by `reserve_ai_proposal`, the agenda, and the user's instruction. It records a request reservation before the model call and returns a validated proposal for human review; it never writes a model change itself.

## Evidence boundary

Local PGlite, browser-mock, and GitHub Actions validation do not prove the live Supabase OAuth, Realtime, Vercel, or Euria configuration. Record the deployed URL, selected model, displayed price, request count, and live test result after provisioning.
