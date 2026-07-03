"""
A minimal, runnable RAG (Retrieval Augmented Generation) demo.

It walks through the four steps from the article "RAG Explained: The Way I Wish
Someone Had Explained It to Me":

    1. Chunk documents into manageable pieces
    2. Embed each chunk into a 384-dimensional vector (meaning, not keywords)
    3. Store the vectors so we can search them by similarity
    4. Retrieve the chunks closest to the question, then Generate a grounded answer

The vector store here is a plain NumPy cosine-similarity search kept in memory —
deliberately tiny so you can read every line. In production you'd swap step 3 for
a real vector database (FAISS, Chroma, pgvector, Pinecone, ...); the shape of the
code doesn't change.

Usage:
    pip install -r requirements.txt
    export ANTHROPIC_API_KEY=sk-...        # optional — see note below
    python rag_demo.py "How much parental leave do I get?"

If no Claude credentials are available, the demo still runs the full retrieval
pipeline and prints the chunks it *would* have handed to the model, so you can
see the "R" of RAG working without an API key.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

# all-MiniLM-L6-v2 produces 384-dimensional embeddings — the same size used in
# the article. Small, fast, and downloaded automatically on first run.
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
CLAUDE_MODEL = "claude-opus-4-8"
DOCS_DIR = Path(__file__).parent / "sample_docs"
TOP_K = 3  # how many chunks to retrieve for each question


# --------------------------------------------------------------------------- #
# Step 1 — Chunking
# --------------------------------------------------------------------------- #
def chunk_document(text: str, source: str) -> list[dict]:
    """Split a document into chunks on blank lines (paragraph/section breaks).

    Real systems use smarter, overlapping, token-aware splitters. Splitting on
    section boundaries is enough to show the idea: keep each chunk small enough
    to be a precise retrieval unit and to fit comfortably in the context window.
    """
    raw_chunks = [c.strip() for c in text.split("\n\n") if c.strip()]
    return [{"text": c, "source": source} for c in raw_chunks]


def load_chunks() -> list[dict]:
    chunks: list[dict] = []
    for path in sorted(DOCS_DIR.glob("*.md")):
        chunks.extend(chunk_document(path.read_text(), path.name))
    return chunks


# --------------------------------------------------------------------------- #
# Steps 2 & 3 — Embed and store
# --------------------------------------------------------------------------- #
class VectorStore:
    """An in-memory vector store: embeddings + cosine-similarity search.

    "A vector database isn't storing documents. It's storing meaning."
    We normalise every vector to unit length, so a plain dot product *is* the
    cosine similarity — the closer to 1.0, the more similar the meaning.
    """

    def __init__(self, model: SentenceTransformer):
        self.model = model
        self.chunks: list[dict] = []
        self.embeddings: np.ndarray | None = None

    def add(self, chunks: list[dict]) -> None:
        self.chunks = chunks
        vectors = self.model.encode(
            [c["text"] for c in chunks],
            normalize_embeddings=True,
        )
        self.embeddings = np.asarray(vectors, dtype=np.float32)
        print(
            f"Embedded {len(chunks)} chunks into "
            f"{self.embeddings.shape[1]}-dimensional vectors."
        )

    # ----------------------------------------------------------------------- #
    # Step 4a — Retrieve
    # ----------------------------------------------------------------------- #
    def search(self, query: str, top_k: int = TOP_K) -> list[dict]:
        assert self.embeddings is not None, "add() chunks before searching"
        query_vec = self.model.encode([query], normalize_embeddings=True)[0]
        # Cosine similarity of the question against every stored chunk.
        scores = self.embeddings @ query_vec
        top_idx = np.argsort(scores)[::-1][:top_k]
        return [{**self.chunks[i], "score": float(scores[i])} for i in top_idx]


# --------------------------------------------------------------------------- #
# Step 4b — Generate
# --------------------------------------------------------------------------- #
def build_prompt(question: str, retrieved: list[dict]) -> str:
    context = "\n\n".join(
        f"[{i + 1}] (from {c['source']})\n{c['text']}"
        for i, c in enumerate(retrieved)
    )
    return (
        "Answer the question using ONLY the context below. "
        "If the context doesn't contain the answer, say so plainly. "
        "Cite the sources you used by their [number].\n\n"
        f"Context:\n{context}\n\n"
        f"Question: {question}"
    )


def generate_answer(prompt: str) -> str | None:
    """Ask Claude to answer, grounded in the retrieved context.

    Returns None if the Anthropic SDK isn't installed or no credentials are
    configured, so the demo degrades gracefully to retrieval-only.
    """
    try:
        import anthropic
    except ImportError:
        return None

    try:
        client = anthropic.Anthropic()  # picks up ANTHROPIC_API_KEY or an `ant` profile
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as exc:  # noqa: BLE001 — surface any auth/network issue to the user
        print(f"\n(Skipping generation — could not reach Claude: {exc})")
        return None

    return "".join(block.text for block in response.content if block.type == "text")


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> None:
    question = (
        " ".join(sys.argv[1:])
        or "How much parental leave do I get, and how do I roll back a bad deploy?"
    )

    print(f"Loading embedding model ({EMBEDDING_MODEL})...")
    store = VectorStore(SentenceTransformer(EMBEDDING_MODEL))
    store.add(load_chunks())

    print(f"\nQuestion: {question}\n")

    retrieved = store.search(question)
    print("Retrieved chunks (most relevant first):")
    for c in retrieved:
        preview = c["text"].splitlines()[0][:70]
        print(f"  {c['score']:.3f}  {c['source']:<24} {preview}")

    prompt = build_prompt(question, retrieved)
    answer = generate_answer(prompt)

    if answer is None:
        print(
            "\nNo Claude answer generated (no credentials). The chunks above are "
            "exactly what would be sent to the model as grounding context."
        )
    else:
        print("\n" + "=" * 70)
        print("Grounded answer:\n")
        print(answer)
        print("=" * 70)


if __name__ == "__main__":
    main()
