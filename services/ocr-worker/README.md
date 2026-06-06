# ocr-worker

Cloud Run worker for the **acc_firm AI bookkeeping** pipeline. Offloads the heavy,
multi-step Gemini work (OCR → classification → journal generation) out of the
Next.js Route Handlers so it never hits Vercel's request timeout.

## Flow

1. Next.js queues a row in `ocr_processing_jobs` (status `pending`) and, on trigger,
   sets it to `processing` then **fire-and-forget POSTs** `/process` to this worker.
2. The worker (this service):
   - re-checks the `acc_firm_clients` relationship is `active`
   - validates the storage path belongs to the client org (`<client_org_id>/...`)
   - downloads the document, runs Gemini OCR + classify + journal
   - writes a **draft** `journal_entries` + `journal_items` (idempotent — clears any
     stale draft first; line numbers are re-sequenced, never trusted from the model)
   - updates `ocr_processing_jobs` to `completed` / `failed`
3. The UI polls job status; the accountant reviews and posts via the Next.js
   `/api/acc-firm/ocr/jobs/approve` route (posting stays in the BFF).

Audit attribution: the worker calls `set_audit_context(actor_id = triggered_by)` and
sets `journal_entries.created_by = triggered_by`, so audit logs credit the real user,
not the service account.

## Develop

```bash
pnpm install            # from repo root
pnpm ocr-worker:dev     # nest start --watch on :8080
# or: cd services/ocr-worker && pnpm dev

curl localhost:8080/healthz                       # -> { "ok": true }
curl -XPOST localhost:8080/process -H 'x-worker-secret: wrong' # -> 401
```

## Env

See `.env.example`: `PORT`, `WORKER_SECRET`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`.

## Deploy (Cloud Run, asia-southeast1)

```bash
gcloud run deploy ocr-worker \
  --source services/ocr-worker \
  --region asia-southeast1 \
  --set-env-vars "WORKER_SECRET=...,SUPABASE_URL=...,SUPABASE_SERVICE_ROLE_KEY=...,GEMINI_API_KEY=..."
```

For production, prefer Google Cloud IAM (`roles/run.invoker`) over the shared secret.
Then set `OCR_WORKER_URL` + `WORKER_SECRET` on the apps/perpos deployment.
