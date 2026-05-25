import asyncio

class MockCollection:
    def __init__(self, name):
        self.name = name
        self._data = []

    async def find_one(self, query):
        for item in self._data:
            match = True
            for k, v in query.items():
                if item.get(k) != v:
                    match = False
                    break
            if match:
                return item
        return None

    async def insert_one(self, document):
        self._data.append(document)
        class Result:
            inserted_id = "mock_id_" + str(len(self._data))
        return Result()

    async def count_documents(self, query=None):
        if not query:
            return len(self._data)
        count = 0
        for item in self._data:
            match = True
            for k, v in (query or {}).items():
                if item.get(k) != v:
                    match = False
                    break
            if match:
                count += 1
        return count

    def find(self, query=None):
        return MockCursor(self._data, query or {})


class MockCursor:
    def __init__(self, data, query=None):
        self._all = data
        self.query = query or {}

    def _filtered(self):
        if not self.query:
            return list(self._all)
        out = []
        for item in self._all:
            if all(item.get(k) == v for k, v in self.query.items()):
                out.append(item)
        return out

    def sort(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    async def to_list(self, length):
        return self._filtered()[:length]


class MockDatabase:
    def __init__(self):
        self.users = MockCollection("users")
        self.uploads = MockCollection("uploads")
        self.chat_history = MockCollection("chat_history")
        self.feedback = MockCollection("feedback")
        self.reports = MockCollection("reports")

    def __getitem__(self, name):
        return MockCollection(name)

mock_db = MockDatabase()

# Pre-populate with a default user for the "fest" demo
# Password is 'password' (hashed using bcrypt as per app/utils/security.py)
from app.utils.security import get_password_hash
mock_db.users._data.append({
    "_id": "mock_admin_id",
    "email": "admin@agrinexus.com",
    "hashed_password": get_password_hash("password"),
    "full_name": "Admin User",
    "role": "admin",
    "is_active": True
})
mock_db.users._data.append({
    "_id": "mock_farmer_id",
    "email": "farmer@agrinexus.com",
    "hashed_password": get_password_hash("password"),
    "full_name": "Demo Farmer",
    "role": "farmer",
    "is_active": True
})
