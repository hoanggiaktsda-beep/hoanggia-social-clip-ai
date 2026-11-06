FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/requirements.txt /app/server/requirements.txt
RUN pip install --no-cache-dir -r /app/server/requirements.txt
COPY index.html clip-app.js /app/
COPY assets /app/assets
COPY server /app/server
ENV PYTHONUNBUFFERED=1
EXPOSE 10000
CMD ["sh","-c","uvicorn server.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
