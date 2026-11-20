# copyparty-media-wall: the official copyparty image (Pillow + FFmpeg) plus the media-wall front end.
# Build from the repository root:  docker build -f docker/Dockerfile -t copyparty-media-wall .
FROM copyparty/ac:latest

LABEL org.opencontainers.image.title="copyparty-media-wall" \
      org.opencontainers.image.description="Movie-wall front end for copyparty: poster wall, resume playback, multi-window players, share links" \
      org.opencontainers.image.url="https://github.com/jwwam/copyparty-media-wall" \
      org.opencontainers.image.source="https://github.com/jwwam/copyparty-media-wall" \
      org.opencontainers.image.licenses="MIT"

COPY web/index.html web/app.js web/app.css /wall/
COPY docker/entrypoint.py /wall-entrypoint.py

ENV WALL_USER=wall \
    WALL_PERM=r

VOLUME ["/data"]
EXPOSE 3923
ENTRYPOINT ["/usr/bin/python3", "/wall-entrypoint.py"]
