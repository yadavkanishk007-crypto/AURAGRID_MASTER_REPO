# Google Cloud Run Deployment Guide (WSL/Linux)

This walkthrough provides step-by-step instructions for deploying your FastAPI backend to **Google Cloud Run** using WSL (Windows Subsystem for Linux) or a Linux terminal.

---

## 🚀 Deployment Methods Overview

We recommend **Method 1 (gcloud run deploy)** because it uses **Google Cloud Build** to build your container in the cloud. This avoids the need to set up and run a local Docker daemon inside WSL, which can often be slow or problematic.

---

## 🛠️ Step 1: Install and Initialize Google Cloud SDK in WSL

If you haven't installed the `gcloud` CLI inside WSL yet, run the following commands:

```bash
# 1. Add the Cloud SDK distribution URI as a package source
echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list

# 2. Import the Google Cloud public key
curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg

# 3. Update the package list and install the SDK
sudo apt-get update && sudo apt-get install google-cloud-cli -y

# 4. Authenticate and initialize the gcloud CLI
gcloud init
```
*Note: `gcloud init` will open a browser window on Windows for you to sign in to your Google Account. If browser opening fails, use `gcloud init --no-launch-browser` and copy the URL manually.*

---

## 🔑 Step 2: Enable Required Google Cloud APIs

Ensure the necessary APIs are enabled in your Google Cloud Project:

```bash
# Set your project ID (replace with your actual project ID)
export PROJECT_ID="your-gcp-project-id"
gcloud config set project $PROJECT_ID

# Enable the Artifact Registry, Cloud Build, and Cloud Run APIs
gcloud services enable \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    run.googleapis.com
```

---

## 📦 Method 1: Build & Deploy using Google Cloud Build (Recommended)

This method packages your source code, sends it to Cloud Build to build the container, stores it in Google Artifact Registry, and deploys it to Cloud Run—all in one command.

```bash
# Run this from the root of the project (e:\AURAGRID in WSL)
gcloud run deploy auragrid-backend \
    --source . \
    --region us-central1 \
    --allow-unauthenticated \
    --set-env-vars="GRID_APP_NAME=AuraGrid Utility Telemetry Service,GRID_CITY_NAME=Pune Grid (MSEDCL Network),SUPABASE_URL=https://your-supabase-project.supabase.co,SUPABASE_KEY=your-supabase-anon-key"

```

### Prompt Options during Deployment:
1. **Source code location**: Just press `Enter` to use the current directory (`.`).
2. **API Enablement**: If prompted to enable the Cloud Build API or create an Artifact Registry repository, select **`y` (yes)**.

---

## 🐳 Method 2: Deploying via Local Docker & Artifact Registry

If you prefer to build the container locally inside WSL and push it, follow these steps:

### 1. Configure Docker Authentication for GCP
```bash
# Configure gcloud as the credential helper for Docker
gcloud auth configure-docker us-central1-docker.pkg.dev
```

### 2. Create an Artifact Registry Repository
```bash
gcloud artifacts repositories create auragrid-repo \
    --repository-format=docker \
    --location=us-central1 \
    --description="Docker repository for AuraGrid services"
```

### 3. Build & Tag the Image Locally
```bash
# Build the Docker image
docker build -t us-central1-docker.pkg.dev/$PROJECT_ID/auragrid-repo/backend:latest .

# Push the Docker image to Artifact Registry
docker push us-central1-docker.pkg.dev/$PROJECT_ID/auragrid-repo/backend:latest
```

### 4. Deploy the Container to Cloud Run
```bash
gcloud run deploy auragrid-backend \
    --image us-central1-docker.pkg.dev/$PROJECT_ID/auragrid-repo/backend:latest \
    --region us-central1 \
    --allow-unauthenticated
```

---

## 🔐 Step 3: Configure Database & Sensitive Secrets

Your backend depends on Supabase keys and database configurations. **Never hardcode secrets in command lines or commit them to Git.**

Use Cloud Run's environment configuration to inject them securely:

```bash
# Update environment variables dynamically on your deployed service
gcloud run services update auragrid-backend \
    --region us-central1 \
    --update-env-vars="SUPABASE_URL=https://your-supabase-project.supabase.co,SUPABASE_KEY=your-supabase-anon-key"
```

*For production deployments, consider storing keys in **Google Secret Manager** and referencing them directly in your Cloud Run settings.*

---

## 🔍 Step 4: Verification and Logs

Once deployed successfully, Cloud Run will output a service URL (e.g., `https://auragrid-backend-xxxxx-uc.a.run.app`).

### Verify Deployment:
- Open the URL in your browser. It should redirect to `/static/index.html` (the AuraGrid Dashboard).
- Query the API docs to verify routing: `https://auragrid-backend-xxxxx-uc.a.run.app/docs`.

### View Live Logs:
You can stream logs from WSL using:
```bash
gcloud beta run services logs tail auragrid-backend --region us-central1
```
