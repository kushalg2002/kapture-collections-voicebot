# Kapture Finance Collections Voicebot

## Assessment
Kapture — AI Delivery Intern Take-Home Assignment

## 1. Overview

Maya is an outbound AI collections voice agent for Kapture Finance. The agent handles routine overdue-loan conversations while enforcing verification before debt disclosure.

Example customer context:
- Customer: Rahul Sharma
- Loan: Personal Loan
- Overdue EMI: ₹8,499
- Days past due: 12

The implementation uses Vapi for the voice-agent layer, an Express webhook for server-side tools, and Supabase PostgreSQL for persistence.

## 2. Architecture

Customer → Vapi / Telephony → STT → Maya LLM / state logic → TTS → Customer

Maya calls the Express `/webhook` endpoint for scoped actions. The backend uses Supabase PostgreSQL for customer and collection data.

Tools:
- `verify_customer`
- `log_promise_to_pay`
- `send_payment_link`
- `escalate_to_agent`
- `mark_disposition`

See `kapture_collections_architecture.png` and the HLD PDF for the detailed design.

## 3. Conversation and authentication

The critical rule is:

**UNVERIFIED → no debt disclosure**

Maya can introduce herself/company and request the approved verification information. She must not disclose the overdue amount, loan type, delinquency status, or other sensitive debt information until `verify_customer` returns `verified: true`.

High-level states:

1. UNVERIFIED
2. AUTHENTICATING
3. VERIFIED
4. INTENT
5. RESOLUTION
6. DISPOSITION
7. END

A failed verification keeps the conversation outside the VERIFIED state.

## 4. Supported intents

- Will pay / Promise to Pay
- Cannot pay / hardship
- Dispute
- Already paid
- Wrong person / wrong number
- Callback request
- Do-not-call / opt-out
- Hostile or abusive caller
- No input / voicemail

For PTP, Maya captures:
- PTP date
- Payment amount

## 5. Tools

### verify_customer
Inputs:
- `account_id`
- `verification_code`

Purpose:
Authenticates the customer before debt information can be disclosed.

### log_promise_to_pay
Inputs:
- `account_id`
- `ptp_date`
- `amount`

Purpose:
Records a confirmed promise to pay.

### send_payment_link
Inputs:
- `account_id`
- `channel`

Allowed channels:
- `SMS`
- `WHATSAPP`
- `BOTH`

Purpose:
Triggers the payment-link workflow.

### escalate_to_agent
Input:
- `reason`

Purpose:
Routes cases requiring human review.

### mark_disposition
Inputs:
- `account_id`
- `status`
- `notes`

Purpose:
Records the final outcome of the call.

The complete JSON schemas are in `vapi/tool_definitions.json`.

## 6. Guardrails and compliance

- Introduce the agent/company appropriately.
- Do not disclose debt before successful authentication.
- Do not disclose debt to a third party who answers the phone.
- Respect do-not-call requests immediately.
- Handle already-paid claims without harassment or repeated demands.
- Do not threaten, harass, deceive, or invent account information.
- Do not expose secrets or database credentials to the caller.
- Do not disclose debt details in voicemail/no-input scenarios.
- Escalate disputes and cases requiring human review.
- Keep the same safety rules if the customer switches between English and Hindi.

## 7. Local setup

### Backend

```powershell
cd "C:\Users\user\OneDrive\Desktop\kapture-collections-voicebot\backend"
npm install
node server.js
```

Expected output:

```text
Kapture Finance API running on port 3000
```

### Environment

Create `backend/.env`:

```env
PORT=3000
DATABASE_URL=postgresql://<supabase-user>:<password>@<supabase-session-pooler-host>:5432/postgres
```

Do not commit `.env` or database credentials.

### Public webhook for development

In another terminal:

```powershell
cd "C:\Users\user\OneDrive\Desktop\kapture-collections-voicebot"
ngrok http 3000
```

Configure Vapi with:

```text
https://<ngrok-host>/webhook
```

The ngrok URL is temporary and is intended for development/testing.

## 8. Validation performed

The following backend/API checks were successfully completed with Vapi-shaped webhook requests:

- `verify_customer` — successful verification
- `log_promise_to_pay` — PTP created successfully
- `send_payment_link` — SMS channel accepted successfully
- `escalate_to_agent` — escalation created successfully
- `mark_disposition` — disposition logged successfully
- Supabase PostgreSQL connection — successful
- Public ngrok endpoint — successful

The database health endpoint returned `database: connected`.

## 9. Debugging notes

### Supabase authentication failure
The initial database connection failed with a Postgres password authentication error. The connection string was corrected to use the Supabase session-pooler username and the reset database password. The connection was then verified successfully with `SELECT NOW()`.

### Local port conflict
Port 3000 was already occupied by a Node process. The process was identified with `netstat` and `tasklist`, terminated, and the backend was restarted.

### ngrok tunnel
The tunnel initially appeared to be unavailable because an existing endpoint was already online. The active tunnel was restarted and verified with `ngrok http 3000 --log=stdout`.

## 10. Vapi status

The final published assistant version is:

**Kapture Finance Collections VoiceBot v1.0**

The assistant was published as the current Vapi version.

## 11. Demo limitation

The assessment requests a live Vapi call or recording showing:
1. a successful Promise-to-Pay path; and
2. an edge-case path.

The backend, database, five tools, and public webhook were independently tested successfully. A live Vapi voice call was not completed because the available Vapi voice credits were exhausted before the final end-to-end call.

This is intentionally documented as a validation limitation rather than represented as a completed live-call test.

## 12. What I would improve with more time

- Deploy the webhook to a persistent HTTPS service instead of development ngrok.
- Add production-grade identity verification and rate limiting.
- Add automated state-transition and prohibited-disclosure tests.
- Integrate a real payment-link SMS/WhatsApp provider.
- Add payment reconciliation.
- Add bilingual English/Hindi evaluation cases.
- Add latency, containment, PTP, drop-rate and tool-error dashboards.
- Add privacy-aware transcript and recording retention policies.