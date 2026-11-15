# FirstPR backend: one image runs both the API and the sync worker.
#   API:  docker run <image>
#   Sync: docker run <image> python -m app.sync.run --language python
FROM python:3.12-slim

# No .pyc files, and logs go straight to stdout (no buffering).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies first, in their own layer, so editing code
# doesn't force a full reinstall on every build.
COPY pyproject.toml ./
RUN mkdir app && touch app/__init__.py && pip install . && rm -rf app

COPY alembic.ini ./
COPY app ./app
RUN pip install --no-deps .

# Don't run as root inside the container.
RUN useradd --create-home appuser
USER appuser

# Hosts like Render/Railway/Fly pass the port in $PORT; default to 8000 locally.
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers"]
