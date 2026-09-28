#!/bin/bash
set -euo pipefail

API_URL="https://smartpay-api.seedwordai.workers.dev"

if [[ "${1:-}" == "--local" ]]; then
  API_URL="http://localhost:8787"
  echo "Running in local mode against $API_URL"
fi

echo "1. Checking health..."
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health")
if [[ "$HEALTH" != "200" ]]; then
  echo "Health check failed with status $HEALTH"
  exit 1
fi
echo "Health check passed."

echo "2. Submitting invoice..."
TEXT="Pay 10 RLUSD to rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De for E2E test invoice #$(date +%s). Due 2026-07-10."
RES=$(curl -s -X POST "$API_URL/v1/invoices" -H "Content-Type: application/json" -d "{\"text\": \"$TEXT\", \"submitter\": \"e2e-script\"}")

ID=$(echo "$RES" | jq -r '.id // empty')
if [[ -z "$ID" || "$ID" == "null" ]]; then
  echo "Failed to submit invoice. Response:"
  echo "$RES"
  exit 1
fi
echo "Submitted invoice $ID"

echo "3. Polling for pending_approval..."
for i in {1..15}; do
  STATUS=$(curl -s "$API_URL/v1/invoices/$ID" | jq -r '.status')
  if [[ "$STATUS" == "pending_approval" ]]; then
    echo "Status is pending_approval."
    break
  fi
  if [[ "$STATUS" == "needs_review" || "$STATUS" == "failed" ]]; then
    echo "Invoice stuck in $STATUS. Exiting."
    curl -s "$API_URL/v1/invoices/$ID" | jq .
    exit 1
  fi
  echo "Waiting... (current status: $STATUS)"
  sleep 2
done

if [[ "$STATUS" != "pending_approval" ]]; then
  echo "Timeout waiting for pending_approval."
  exit 1
fi

echo "4. Approving invoice..."
APPROVE_RES=$(curl -s -X POST "$API_URL/v1/invoices/$ID/approve" -H "Content-Type: application/json" -d '{"approver": "e2e-admin"}')
APPROVE_STATUS=$(echo "$APPROVE_RES" | jq -r '.status // empty')

if [[ "$APPROVE_STATUS" != "settled" ]]; then
  echo "Approval returned unexpected status (note: it could be rejected due to no funds locally). Response:"
  echo "$APPROVE_RES"
  # Don't strictly fail if the error is no_rlusd_funds, since the prompt says "settle will stop at no_trustline/no_rlusd_funds locally — that is CORRECT behavior; document the output"
  CODE=$(echo "$APPROVE_RES" | jq -r '.code // empty')
  if [[ "$CODE" == "no_trustline" || "$CODE" == "no_rlusd_funds" || "$CODE" == "no_trustline_dest" ]]; then
     echo "Expected failure due to lack of funds/trustline in agent wallet: $CODE"
     exit 0
  fi
  exit 1
fi

echo "5. Polling for settled..."
for i in {1..15}; do
  STATUS=$(curl -s "$API_URL/v1/invoices/$ID" | jq -r '.status')
  if [[ "$STATUS" == "settled" ]]; then
    echo "Status is settled."
    break
  fi
  if [[ "$STATUS" == "failed" || "$STATUS" == "rejected" ]]; then
    echo "Invoice failed to settle. Status: $STATUS"
    curl -s "$API_URL/v1/invoices/$ID" | jq .
    exit 1
  fi
  echo "Waiting... (current status: $STATUS)"
  sleep 2
done

if [[ "$STATUS" != "settled" ]]; then
  echo "Timeout waiting for settlement."
  exit 1
fi

TX_HASH=$(curl -s "$API_URL/v1/invoices/$ID" | jq -r '.tx_hash')
echo "SUCCESS! Transaction hash: $TX_HASH"
echo "https://testnet.xrpl.org/transactions/$TX_HASH"
