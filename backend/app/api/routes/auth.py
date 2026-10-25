"""Registration, login and session identity."""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.serializers import serialize_user
from app.core.security import (
    CurrentUser,
    DbSession,
    create_access_token,
    get_token_from_request,
    hash_password,
    verify_password,
)
from app.db.models import User, utcnow
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginThrottle:
    """Small in-process brute-force guard. Replace with Redis when scaling out."""

    def __init__(self, limit: int = 8, window_seconds: int = 600) -> None:
        self.limit = limit
        self.window = window_seconds
        self.attempts: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        bucket = self.attempts[key]
        while bucket and bucket[0] < now - self.window:
            bucket.popleft()
        if len(bucket) >= self.limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many sign-in attempts. Please try again in ten minutes.",
            )

    def fail(self, key: str) -> None:
        self.attempts[key].append(time.monotonic())

    def clear(self, key: str) -> None:
        self.attempts.pop(key, None)


throttle = LoginThrottle()


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: DbSession) -> AuthResponse:
    email = payload.email.lower().strip()
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email is already registered. Please sign in instead.",
        )
    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        terms_accepted_at=utcnow(),
        style_preferences=[],
        avoid_colors=[],
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="This email is already registered.") from exc
    db.refresh(user)
    token = create_access_token(user.id)
    return AuthResponse(access_token=token, user=serialize_user(user, token))


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, request: Request, db: DbSession) -> AuthResponse:
    client = request.client.host if request.client else "unknown"
    throttle_key = f"{client}:{payload.email.lower()}"
    throttle.check(throttle_key)
    user = db.scalar(select(User).where(User.email == payload.email.lower().strip()))
    if user is None or not verify_password(payload.password, user.password_hash):
        throttle.fail(throttle_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    throttle.clear(throttle_key)
    token = create_access_token(user.id)
    return AuthResponse(access_token=token, user=serialize_user(user, token))


@router.get("/me", response_model=AuthResponse)
def me(user: CurrentUser, request: Request) -> AuthResponse:
    token = get_token_from_request(request) or ""
    return AuthResponse(access_token=token, user=serialize_user(user, token))
