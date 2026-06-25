from pathlib import Path
import pickle
import time
from typing import Any

class LocalFolderWithBytes:
    def __init__(
        self, directory: str = None, retry_sleep_time: int = 3, max_retry: int = 3
    ):
        print(f"__init__ called with directory={directory}, retry_sleep_time={retry_sleep_time}, max_retry={max_retry} __init__ called ")
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.retry_sleep_time = retry_sleep_time
        self.max_retry = max_retry

    def _get_success_flag_file(self, key):
        print(f"_get_success_flag_file called with key={key} _get_success_flag_file called")
        return self.directory / ("success_" + key)

    def _delete_success_flag(self, key):
        print(f"_delete_success_flag called with key={key} _delete_success_flag called")
        filepath = self._get_success_flag_file(key)
        if filepath.exists():
            filepath.unlink()

    def _put_success_flag(self, key):
        print(f"_put_success_flag called with key={key} _put_success_flag called")
        filepath = self._get_success_flag_file(key)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        with open(filepath, "w") as f:
            f.write("")

    def get(self, key, default=None):
        print(f"get called with key={key}, default={default} get called")
        success_flag_file = self._get_success_flag_file(key)
        patience = self.max_retry
        while not success_flag_file.exists():
            time.sleep(self.retry_sleep_time)
            patience -= 1
            if patience == 0:
                return default
        filepath = self.directory / key
        if filepath.exists():
            with open(filepath, "rb") as f:
                return f.read()
        return default

    def __getitem__(self, key):
        print(f"__getitem__ called with key={key} __getitem__ called")
        return self.get(key)

    def __setitem__(self, key, value: Any):
        print(f"__setitem__ called with key={key}, value_type={type(value)} __setitem__ called")
        assert isinstance(value, bytes), f"value must be bytes, but got {type(value)}"
        filepath = self.directory / key
        self._delete_success_flag(key)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        with open(filepath, "wb") as f:
            f.write(value)
        self._put_success_flag(key)

    def __len__(self):
        print("__len__ called with no parameters")
        return len(list(self.directory.glob("*")))

    def __delitem__(self, key):
        print(f"__delitem__ called with key={key} __delitem__ called")
        filepath = self.directory / key
        if filepath.exists():
            filepath.unlink()

    def items(self):
        print("items called with no parameters")
        for filepath in self.directory.glob("*"):
            key = filepath.name
            yield key, self.get(key)


class LocalFolder:
    def __init__(
        self, directory: str = None, retry_sleep_time: int = 3, max_retry: int = 3
    ):
        print(f"__init__ called with directory={directory}, retry_sleep_time={retry_sleep_time}, max_retry={max_retry} __init__ called")
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.suffix = ".pkl"
        self.retry_sleep_time = retry_sleep_time
        self.max_retry = max_retry

    def _get_success_flag_file(self, key):
        print(f"_get_success_flag_file called with key={key} _get_success_flag_file called")
        return self.directory / ("success_" + key)

    def _delete_success_flag(self, key):
        print(f"_delete_success_flag called with key={key} _delete_success_flag called")
        filepath = self._get_success_flag_file(key)
        if filepath.exists():
            filepath.unlink()

    def _put_success_flag(self, key):
        print(f"_put_success_flag called with key={key} _put_success_flag called")
        filepath = self._get_success_flag_file(key)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        with open(filepath, "w") as f:
            f.write("")

    def get(self, key, default=None):
        print(f"get called with key={key}, default={default} get called")
        success_flag_file = self._get_success_flag_file(key)
        patience = self.max_retry
        while not success_flag_file.exists():
            time.sleep(self.retry_sleep_time)
            patience -= 1
            if patience == 0:
                return default
        filepath = self.directory / (key + self.suffix)
        if filepath.exists():
            with open(filepath, "rb") as f:
                return pickle.load(f)
        return default

    def __getitem__(self, key):
        print(f"__getitem__ called with key={key} __getitem__ called")
        return self.get(key)

    def __setitem__(self, key, value: Any):
        print(f"__setitem__ called with key={key} __setitem__ called")
        filepath = self.directory / (key + self.suffix)
        self._delete_success_flag(key)
        with open(filepath, "wb") as f:
            pickle.dump(value, f)
        self._put_success_flag(key)

    def __delitem__(self, key):
        print(f"__delitem__ called with key={key} __delitem__ called")
        filepath = self.directory / (key + self.suffix)
        if filepath.exists():
            filepath.unlink()

    def __len__(self):
        print("__len__ called with no parameters")
        return len(list(self.directory.glob(f"*{self.suffix}")))

    def items(self):
        print("items called with no parameters")
        for filepath in self.directory.glob(f"*{self.suffix}"):
            key = filepath.name[: -len(self.suffix)]
            yield key, self.get(key)

    def get_parameter(self, filepath):
        print(f"get_parameter called with filepath={filepath} get_parameter called")
        try:
            key = filepath.name[: -len(self.suffix)]
            return key, self.get(key)
        except EOFError:
            return None, None

    def get_raw_folder(self):
        print("get_raw_folder called with no parameters")
        return LocalFolderWithBytes(
            directory=self.directory,
            retry_sleep_time=self.retry_sleep_time,
            max_retry=self.max_retry,
        )
