import hashlib
import random
from typing import List

from app.config import settings

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    SentenceTransformer = None


class EmbeddingService:
    """Embeddings load lazily so the API process can start without heavy ML deps."""

    def __init__(self, model_name: str | None = None):
        self._model = None
        self._model_name = model_name or settings.EMBEDDING_MODEL

    def _get_model(self):
        if SentenceTransformer is None:
            return None
        if self._model is None:
            self._model = SentenceTransformer(self._model_name)
        return self._model

    @staticmethod
    def _stub_embedding(text: str, dim: int = 384) -> List[float]:
        seed = int(hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()[:16], 16)
        rng = random.Random(seed)
        return [rng.random() for _ in range(dim)]

    def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        model = self._get_model()
        if model is None:
            return [self._stub_embedding(t) for t in texts]
        embeddings = model.encode(texts)
        return embeddings.tolist()

    def generate_query_embedding(self, query: str) -> List[float]:
        model = self._get_model()
        if model is None:
            return self._stub_embedding(query)
        embedding = model.encode(query)
        return embedding.tolist()


embedding_service = EmbeddingService()
