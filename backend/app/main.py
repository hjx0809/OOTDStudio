"""FastAPI application entrypoint for OUL Studio."""

from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import auth, media, recommendations, users, wardrobe, weather
from app.core.config import get_settings
from app.db.session import init_db
from app.services.jobs import resume_pending_work

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("oul.api")
settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    init_db()
    # Dev reloads and crashed processes leave jobs behind; pick them back up.
    resume_pending_work()
    if settings.is_production and settings.secret_key.startswith("change-me"):
        logger.error("SECRET_KEY is still the development default in production")
    logger.info(
        "OUL API ready | env=%s ai=%s",
        settings.environment,
        "enabled" if settings.ai_enabled else "atelier-only",
    )
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Private wardrobe, weather-aware AI styling and virtual try-on.",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["X-Request-ID"],
    )
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    @app.middleware("http")
    async def request_context(request: Request, call_next):  # type: ignore[no-untyped-def]
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        started = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "geolocation=(self), camera=(self), microphone=()"
        )
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )
        if request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = (
                "no-store" if request.url.path.startswith("/api/auth") else "no-cache"
            )
            logger.info(
                "%s %s %s %.1fms req=%s",
                request.method,
                request.url.path,
                response.status_code,
                duration_ms,
                request_id,
            )
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else None
        message = "提交的信息不完整或格式不正确"
        if first:
            raw = str(first.get("msg") or "").removeprefix("Value error, ")
            location = ".".join(
                str(part) for part in first.get("loc", []) if part not in {"body", "query"}
            )
            if raw:
                message = raw
            elif location:
                message = f"请检查 {location}"
        return JSONResponse(status_code=422, content={"detail": message})

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception):
        logger.exception("Unhandled error at %s", request.url.path)
        return JSONResponse(
            status_code=500, content={"detail": "服务暂时开小差了，请稍后重试"}
        )

    for router in (
        auth.router,
        users.router,
        wardrobe.router,
        recommendations.router,
        weather.router,
        media.router,
    ):
        app.include_router(router, prefix=settings.api_prefix)

    @app.get("/api/health", tags=["system"])
    def health() -> dict[str, object]:
        return {
            "status": "ok",
            "version": settings.app_version,
            "ai": "gemini" if settings.ai_enabled else "atelier",
        }

    _mount_frontend(app)
    return app


def _mount_frontend(app: FastAPI) -> None:
    dist = settings.frontend_dist
    index = dist / "index.html"
    if settings.serve_frontend and index.is_file():
        assets = dist / "assets"
        if assets.is_dir():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa(full_path: str):
            if full_path.startswith("api/"):
                raise HTTPException(status_code=404, detail="接口不存在")
            if full_path:
                candidate = (dist / full_path).resolve()
                try:
                    candidate.relative_to(dist.resolve())
                except ValueError:
                    candidate = None
                if candidate is not None and candidate.is_file():
                    return FileResponse(candidate)
            return FileResponse(index)
    else:

        @app.get("/", include_in_schema=False)
        async def root() -> dict[str, str]:
            return {
                "name": settings.app_name,
                "docs": "/api/docs",
                "message": "Frontend has not been built. Run `npm run build` in frontend/.",
            }


app = create_app()
