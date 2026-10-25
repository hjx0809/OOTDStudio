.PHONY: install dev-backend dev-frontend build serve test typecheck clean

PYTHON ?= python3
VENV ?= .venv
PIP := $(VENV)/bin/pip
PY := $(VENV)/bin/python

install:
	$(PYTHON) -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -r backend/requirements-dev.txt
	cd frontend && npm install

dev-backend:
	$(PY) -m uvicorn app.main:app --app-dir backend --reload --host 0.0.0.0 --port 8000

dev-frontend:
	cd frontend && npm run dev

build:
	cd frontend && npm run build

serve: build
	$(PY) -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000

test:
	cd backend && ../$(PY) -m pytest

typecheck:
	cd frontend && npm run typecheck

clean:
	rm -rf frontend/dist frontend/node_modules backend/.pytest_cache
