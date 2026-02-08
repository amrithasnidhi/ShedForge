from __future__ import annotations

import asyncio
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class NotificationHub:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[user_id].add(websocket)

    async def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            sockets = self._connections.get(user_id)
            if not sockets:
                return
            sockets.discard(websocket)
            if not sockets:
                self._connections.pop(user_id, None)

    async def publish(self, user_id: str, payload: dict) -> None:
        async with self._lock:
            sockets = list(self._connections.get(user_id, set()))

        if not sockets:
            return

        stale: list[WebSocket] = []
        for websocket in sockets:
            try:
                await websocket.send_json(payload)
            except Exception:  # pragma: no cover - network/runtime dependent
                stale.append(websocket)

        if stale:
            async with self._lock:
                active = self._connections.get(user_id, set())
                for socket in stale:
                    active.discard(socket)
                if not active:
                    self._connections.pop(user_id, None)
            logger.debug("Removed %d stale notification websocket(s) for user %s", len(stale), user_id)


notification_hub = NotificationHub()
