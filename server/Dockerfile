# Backend-only Dockerfile for Render deployment (backend 브랜치용)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies (Dockerfile이 backend/server 안에 있으므로 상대 경로 사용)
COPY server/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY server/ .

# Default port (Render sets PORT env if needed)
ENV PORT=5001
EXPOSE 5001

CMD ["python", "app.py"]

