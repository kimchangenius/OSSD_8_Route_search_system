# Backend-only Dockerfile for Render deployment (backend 브랜치용)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies (build context가 리포지토리 루트인 경우 경로를 명시)
COPY backend/server/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/server/ .

# Default port (Render sets PORT env if needed)
ENV PORT=5001
EXPOSE 5001

CMD ["python", "app.py"]

