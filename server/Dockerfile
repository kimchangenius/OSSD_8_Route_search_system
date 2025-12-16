FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY server/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --no-compile -r requirements.txt

COPY server/ .

# Render가 PORT를 주입하므로 기본값만 fallback으로 사용
ENV PORT=8000

# $PORT를 shell에서 확장시키기 위해 sh -c 사용
CMD ["sh", "-c", "sanic app:app --host=0.0.0.0 --port ${PORT:-10000} --single-process"]
