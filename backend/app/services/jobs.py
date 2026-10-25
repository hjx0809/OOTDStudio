"""Request-independent background jobs for styling and image rendering.

Starlette's ``BackgroundTasks`` are tied to the request that scheduled them:
they only start once the response has been sent, and the work shares the
request's lifetime. A style generation can take a minute or more, so it is
handed to plain worker threads instead. The HTTP response returns at once and
leaving the page, closing the tab or navigating to the wardrobe never cancels
work that is already running.

Jobs use their own database sessions. A restart (dev ``--reload``, crash,
deploy) kills in-flight jobs, so ``resume_pending_work`` requeues anything the
previous process left behind.
"""

from __future__ import annotations

import logging
import threading
from typing import Callable

from sqlalchemy import or_, select

from app.core.config import get_settings
from app.db.models import Outfit, Recommendation
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

# Gemini image calls are the expensive part; keep a handful in flight at a
# time rather than one per request thread.
_MAX_CONCURRENT_JOBS = 6
_slots = threading.BoundedSemaphore(_MAX_CONCURRENT_JOBS)


def _run(label: str, job: Callable[..., None], *args: object) -> None:
    try:
        job(*args)
    except Exception:  # pragma: no cover - defensive: workers must never die
        logger.exception("%s job crashed", label)


def _dispatch(label: str, job: Callable[..., None], *args: object) -> None:
    if get_settings().environment == "test":
        # Tests run jobs eagerly so API responses stay deterministic.
        _run(label, job, *args)
        return

    def target() -> None:
        with _slots:
            _run(label, job, *args)

    # Daemon threads so a dev reload or shutdown is never blocked by an
    # in-flight image generation; the next process resumes the job.
    threading.Thread(target=target, name=label, daemon=True).start()


def submit_generation(recommendation_id: str, outfit_count: int = 3) -> None:
    """Plan outfits and queue renders for a recommendation created as pending."""
    from app.services.recommendation_service import run_generation

    def job() -> None:
        run_generation(recommendation_id, outfit_count)

    _dispatch(f"generation:{recommendation_id}", job)


def submit_render(outfit_id: str) -> None:
    """Render (or re-render) one outfit image without blocking a request."""
    from app.services.renderer import render_outfit_image

    _dispatch(f"render:{outfit_id}", render_outfit_image, outfit_id)


def resume_pending_work() -> None:
    """Requeue work interrupted by the last process exiting."""
    db = SessionLocal()
    try:
        planning_ids = db.scalars(
            select(Recommendation.id).where(Recommendation.status == "planning")
        ).all()
        render_ids = db.scalars(
            select(Outfit.id).where(
                or_(
                    Outfit.image_status == "pending",
                    Outfit.image_status == "generating",
                )
            )
        ).all()
    finally:
        db.close()

    for recommendation_id in planning_ids:
        logger.info("Resuming interrupted planning job %s", recommendation_id)
        submit_generation(recommendation_id)
    for outfit_id in render_ids:
        logger.info("Resuming interrupted render job %s", outfit_id)
        submit_render(outfit_id)


__all__ = [
    "resume_pending_work",
    "submit_generation",
    "submit_render",
]
