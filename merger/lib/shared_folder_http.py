import pickle
import time
from typing import Any, Iterator, Optional, Union
import requests


class SharedFolderHTTPAuth:
    """
    HTTP-backed shared folder with per-request Authorization header and success-flag handling.
    Endpoints (must be implemented by your HTTP file‐service):
      GET    /files/<key>          → raw bytes of <key> or 404 if missing
      PUT    /files/<key>          → write raw bytes to <key>
      DELETE /files/<key>          → delete <key>
      GET    /files/list           → JSON list of existing keys
      GET    /files/<key>.success  → existence of success flag (empty body, 200 or 404)
    Usage:
        folder = SharedFolderHTTPAuth(
            base_url="http://host:5000",
            auth_header_value="Bearer TOKEN",
        )
    """

    def __init__(
        self,
        base_url: str,
        auth_header_value: str,
        retry_sleep_time: float = 3.0,
        max_retry: int = 3,
        timeout: float = 5.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.auth_header_value = auth_header_value
        self.retry_sleep_time = retry_sleep_time
        self.max_retry = max_retry
        self.timeout = timeout
        self._headers = {
            "Authorization": self.auth_header_value,
            "Accept": "application/octet-stream",
        }


    def get_raw_folder(self) -> "SharedFolderHTTPAuth":
        """
        The Keras callback calls `.get_raw_folder()` before writing
        models/metrics as raw bytes. Since this class already handles
        raw bytes directly, just return self.
        """
        return self
    
    def _url(self, key: str) -> str:
        return f"{self.base_url}/files/{key}"

    def _url_list(self) -> str:
        return f"{self.base_url}/files/list"

    def _url_flag(self, key: str) -> str:
        return f"{self.base_url}/files/{key}.success"

    def _put_success_flag(self, key: str) -> None:
        """Create the success flag for `key` via HTTP PUT to `<key>.success`."""
        url = self._url_flag(key)
        # empty body
        resp = requests.put(url, headers=self._headers, timeout=self.timeout)
        resp.raise_for_status()

    def _delete_success_flag(self, key: str) -> None:
        """Delete the success flag for `key` via HTTP DELETE."""
        url = self._url_flag(key)
        resp = requests.delete(url, headers=self._headers, timeout=self.timeout)
        if resp.status_code not in (200, 204, 404):
            resp.raise_for_status()

    def _exists_success_flag(self, key: str) -> bool:
        """Check if `<key>.success` exists via HTTP GET (200 = yes, 404 = no)."""
        url = self._url_flag(key)
        resp = requests.get(url, headers=self._headers, timeout=self.timeout)
        if resp.status_code == 200:
            return True
        if resp.status_code == 404:
            return False
        resp.raise_for_status()
        
    def get(self, key: str, default: Optional[bytes] = None) -> Optional[Union[bytes, dict]]:
        # … wait for success flag …
        resp = requests.get(self._url(key), headers=self._headers, timeout=self.timeout)
        if resp.status_code == 200:
            raw = resp.content
            # If you know this key holds a pickled dict, unpickle:
            if not key.endswith(".json"):
                try:
                    return pickle.loads(raw)
                except Exception:
                    return raw
            # else (if you still have .json keys) return raw or json
            return raw

    def __getitem__(self, key: str) -> Optional[bytes]:
        return self.get(key)

    def __setitem__(self, key: str, value: Union[bytes, bytearray, dict]) -> None:
        """
        Always send raw bytes for everything.
        If value is a dict, pickle it first.
        """
        url = self._url(key)
        headers = {**self._headers, "Content-Type": "application/octet-stream"}

        # Pickle dicts into bytes
        if isinstance(value, dict):
            data = pickle.dumps(value)
        elif isinstance(value, (bytes, bytearray)):
            data = value
        else:
            raise ValueError(f"Expected bytes or dict for {key}, got {type(value)}")

        resp = requests.put(
            url,
            headers=headers,
            data=data,
            timeout=self.timeout,
        )
        resp.raise_for_status()
        self._put_success_flag(key)

    def __delitem__(self, key: str) -> None:
        """
        DELETE the raw file and its success-flag.
        """
        # Delete file
        url = self._url(key)
        resp = requests.delete(url, headers=self._headers, timeout=self.timeout)
        if resp.status_code not in (200, 204, 404):
            resp.raise_for_status()
        # Delete flag
        self._delete_success_flag(key)

    def _list_keys(self) -> list[str]:
        """GET /files/list and return a list of all keys."""
        url = self._url_list()
        resp = requests.get(url, headers=self._headers, timeout=self.timeout)
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, list):
            raise ValueError(f"Expected list of keys, got: {data!r}")
        return data

    def items(self) -> Iterator[tuple[str, bytes]]:
        """Yield (key, content_bytes) for each stored file."""
        for key in self._list_keys():
            content = self.get(key)
            if content is not None:
                yield key, content

    def __len__(self) -> int:
        return len(self._list_keys())

    def __repr__(self) -> str:
        return f"<SharedFolderHTTPAuth base_url={self.base_url!r}>"
