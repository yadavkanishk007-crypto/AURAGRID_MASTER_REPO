import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.api.endpoints import router as api_router
from app.core.config import settings
from app.core.engine import telemetry_daemon_loop

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AuraGrid")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    logger.info("==========================================")
    logger.info("Initializing AuraGrid Forecasting Engine...")
    logger.info(f"App Name: {settings.app_name}")
    logger.info(f"Version: {settings.version}")
    logger.info(f"City: {settings.city_name}")
    logger.info("==========================================")
    
    # Seed default database schema configuration if empty in Supabase
    try:
        from app.core.database import seed_default_grid
        await seed_default_grid()
    except Exception as e:
        logger.error(f"Failed database seeding on startup: {str(e)}")

    # Synchronize telemetry store in-memory state from Supabase
    try:
        from app.core.engine import telemetry_store
        telemetry_store.sync_from_database()
    except Exception as e:
        logger.error(f"Failed to synchronize state from database on startup: {str(e)}")
    
    # Spin up the background telemetry ingestion daemon task
    daemon_task = asyncio.create_task(telemetry_daemon_loop())
    app.state.daemon_task = daemon_task
    
    yield
    
    # Shutdown actions
    logger.info("Stopping background Telemetry Ingestion Daemon...")
    daemon_task.cancel()
    try:
        await daemon_task
    except asyncio.CancelledError:
        logger.info("Background Telemetry Daemon successfully cancelled.")
    logger.info("Stopping AuraGrid Forecasting Engine. Resources released.")


# Initialize FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="FastAPI service with real-time WebSocket telemetry ingestion and concurrent forecasting models.",
    lifespan=lifespan
)

# Enable CORS for dashboard and development environment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API router
app.include_router(api_router, prefix="/api")

# Mount Static Files (AuraGrid UI Dashboard)
app.mount("/static", StaticFiles(directory="app/static"), name="static")


@app.get("/", include_in_schema=False)
def root_redirect():
    """
    Redirect root requests to the dynamic utility dashboard.
    """
    return RedirectResponse(url="/static/index.html")
