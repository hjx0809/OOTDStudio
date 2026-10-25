"""Pydantic contracts for authentication and user profiles."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

FitPreference = Literal["tailored", "regular", "relaxed"]


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)
    accept_terms: bool

    @field_validator("display_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Please enter your name")
        return value

    @field_validator("accept_terms")
    @classmethod
    def must_accept_terms(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Please accept the Terms of Service and Privacy Policy")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    height_cm: int | None = Field(default=None, ge=120, le=230)
    weight_kg: float | None = Field(default=None, ge=30, le=300)
    chest_cm: float | None = Field(default=None, ge=50, le=200)
    waist_cm: float | None = Field(default=None, ge=40, le=200)
    hip_cm: float | None = Field(default=None, ge=50, le=220)
    inseam_cm: float | None = Field(default=None, ge=40, le=140)
    shoe_size: float | None = Field(default=None, ge=30, le=55)
    body_shape: str | None = Field(default=None, max_length=40)
    skin_tone: str | None = Field(default=None, max_length=40)
    fit_preference: FitPreference | None = None
    style_preferences: list[str] | None = Field(default=None, max_length=10)
    avoid_colors: list[str] | None = Field(default=None, max_length=10)
    city: str | None = Field(default=None, max_length=120)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    display_name: str
    onboarding_completed: bool
    created_at: datetime
    base_photo_url: str | None = None
    base_photo_thumb_url: str | None = None

    height_cm: int | None = None
    weight_kg: float | None = None
    chest_cm: float | None = None
    waist_cm: float | None = None
    hip_cm: float | None = None
    inseam_cm: float | None = None
    shoe_size: float | None = None
    body_shape: str | None = None
    skin_tone: str | None = None
    fit_preference: str = "regular"
    style_preferences: list[str] = Field(default_factory=list)
    avoid_colors: list[str] = Field(default_factory=list)
    city: str | None = None
    latitude: float | None = None
    longitude: float | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class MessageResponse(BaseModel):
    message: str
