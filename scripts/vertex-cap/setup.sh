#!/usr/bin/env bash
# One-time setup of the assistant's lifetime spend cap on Google Cloud.
# Already done: the Pub/Sub topic, the service account and the $20 budget
#   (lifetime from 2026-11-16, Vertex AI only, requests labelled app=nadeloehr).
# This script does the rest. Run it from the repository root.
set -euo pipefail
PROJECT=travelcompanion-341011
REGION=europe-west3
CAP_SA=nadeloehr-vertex-cap@$PROJECT.iam.gserviceaccount.com
VERTEX_SA=vertex-express@$PROJECT.iam.gserviceaccount.com
TOPIC=nadeloehr-vertex-budget

# 1. Let the cap account change one role only: the Vertex express grant.
gcloud projects add-iam-policy-binding $PROJECT \
  --member "serviceAccount:$CAP_SA" \
  --role roles/resourcemanager.projectIamAdmin \
  --condition-from-file scripts/vertex-cap/condition.yaml \
  --format=none

# 2. Deploy the cap service. Internal only, no public invocations.
gcloud run deploy nadeloehr-vertex-cap --project $PROJECT --region $REGION \
  --source scripts/vertex-cap --service-account $CAP_SA \
  --ingress internal --no-allow-unauthenticated --max-instances 1 \
  --set-env-vars PROJECT_ID=$PROJECT,VERTEX_SERVICE_ACCOUNT=$VERTEX_SA,STOP_AT=0.9

# 3. Let Pub/Sub call it, and push the budget's notifications to it.
gcloud run services add-iam-policy-binding nadeloehr-vertex-cap \
  --project $PROJECT --region $REGION \
  --member "serviceAccount:$CAP_SA" --role roles/run.invoker --format=none
URL=$(gcloud run services describe nadeloehr-vertex-cap --project $PROJECT \
  --region $REGION --format 'value(status.url)')
gcloud pubsub subscriptions create nadeloehr-vertex-cap --project $PROJECT \
  --topic $TOPIC --push-endpoint "$URL/" \
  --push-auth-service-account $CAP_SA --ack-deadline 60

# To turn the assistant back on after a cut (only if you raise the budget):
#   gcloud projects add-iam-policy-binding travelcompanion-341011 \
#     --member serviceAccount:vertex-express@travelcompanion-341011.iam.gserviceaccount.com \
#     --role roles/aiplatform.expressUser
