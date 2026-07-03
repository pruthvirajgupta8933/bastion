# RAG Explained

> A plain-English explainer of Retrieval Augmented Generation, plus a tiny
> runnable Python demo you can read in one sitting.
>
> Expanded from the article
> [*RAG Explained: The Way I Wish Someone Had Explained It to Me*](https://medium.com/p/rag-explained-the-way-i-wish-someone-had-explained-it-to-me-d33eb34a2082)
> by Charu Gupta.

---

## The one-sentence version

> Instead of asking an LLM to answer from its training data alone, **RAG first
> retrieves relevant information from outside what the model was trained on**,
> then asks the model to answer using that information.

## The problem RAG solves

A large language model only knows what was in its training data. Ask it about
**your** company's parental-leave policy or **your** deploy runbook and it
can't answer — the information was never in its training set. Worse, it may
*hallucinate* a confident-sounding but wrong answer.

RAG fixes this by putting the right documents *in front of* the model at
question time. The model stops guessing and starts summarising real, current,
company-specific text.

```
Without RAG:   question ───────────────────────────▶ LLM ──▶ guess / hallucination
With RAG:      question ─▶ retrieve relevant docs ─▶ LLM ──▶ grounded answer
```

## How it works — the four steps

RAG is really two phases: an **indexing** phase you do once (steps 1–3) and a
**query** phase you do per question (step 4).

### 1. Chunk

Large documents are split into smaller pieces ("chunks"). Two reasons:
- Chunks must fit inside the model's context window.
- Retrieval is more precise — you pull back the one relevant paragraph, not a
  50-page handbook.

### 2. Embed

Each chunk is converted into a list of numbers — a **vector** — that captures
its *meaning*. In the demo (and in the article) each chunk becomes a
**384-dimensional** vector.

The key mental model:

> Embeddings are like **GPS coordinates for meaning.**

Phrases like *"maternity leave"* and *"parental leave policy"* land close
together in vector space even though they barely share any words. Meaning, not
keywords.

### 3. Store

The vectors go into a **vector database**. The punchline of the whole topic:

> A vector database isn't storing documents. It's storing **meaning**.

Because meaning is stored numerically, you can search by *similarity* — "find
the chunks whose meaning is closest to this question" — instead of by exact
keyword match.

### 4. Retrieve → Generate

At question time:
1. The user's question is embedded into a vector (same model as step 2).
2. That vector is compared against every stored chunk; the closest few are
   pulled back.
3. Those chunks are pasted into the prompt as context, and the LLM generates an
   answer **grounded** in them.

That last step is the "Generation" in Retrieval **Augmented Generation** — the
generation is *augmented* by the retrieved context.

## Why "meaning, not keywords" matters

Run the demo with a question that shares almost no words with the source text:

```
Question: How much parental leave do I get, and how do I roll back a bad deploy?

Retrieved chunks (most relevant first):
  0.527  hr_policies.md           ## Parental Leave
  0.328  engineering_runbook.md   ## Rolling Back a Bad Deploy
  0.294  hr_policies.md           ## Paid Time Off (PTO)
```

One question pulled the right chunk from **two different documents** — the HR
policy *and* the engineering runbook — ranked by semantic similarity (the
`0.527` etc. are cosine-similarity scores, higher = closer in meaning). No
keyword search could do that as cleanly.

## The runnable demo

[`rag_demo.py`](./rag_demo.py) implements all four steps in ~150 readable lines:

| Step | In the code |
|------|-------------|
| 1. Chunk    | `chunk_document()` splits the sample docs on section breaks |
| 2. Embed    | `VectorStore.add()` uses `all-MiniLM-L6-v2` → 384-dim vectors |
| 3. Store    | `VectorStore` keeps normalised vectors in a NumPy array |
| 4. Retrieve | `VectorStore.search()` ranks chunks by cosine similarity |
| 4. Generate | `generate_answer()` asks Claude to answer using only the retrieved context |

### Run it

```bash
pip install -r requirements.txt

# Retrieval only (no API key needed) — prints the chunks it would send:
python rag_demo.py "How much parental leave do I get?"

# Full RAG, including the grounded answer from Claude:
export ANTHROPIC_API_KEY=sk-...
python rag_demo.py "What's the process for a production deploy?"
```

If no Claude credentials are configured, the demo still runs the full retrieval
pipeline and shows you the "R" of RAG — the grounding context — without the "G".

## Where the demo is deliberately simplified

This is a teaching demo. In a real system you'd upgrade three things, but the
**shape of the code stays the same**:

| Demo | Production |
|------|-----------|
| In-memory NumPy cosine search | A real vector DB — [FAISS](https://github.com/facebookresearch/faiss), [Chroma](https://www.trychroma.com/), [pgvector](https://github.com/pgvector/pgvector), Pinecone |
| Split on blank lines | Token-aware, overlapping chunking |
| A handful of `.md` files | Thousands of docs, incremental re-indexing, metadata filters |

## Where RAG is used

- HR assistants answering policy questions
- Engineering support ("how do I deploy?", "how do I roll back?")
- Customer support over product docs
- Any place an LLM needs to answer from knowledge it was never trained on

## Files

```
rag-explained/
├── README.md              ← you are here (the explainer)
├── rag_demo.py            ← the four steps, runnable
├── requirements.txt       ← sentence-transformers, numpy, anthropic
└── sample_docs/
    ├── hr_policies.md         ← HR knowledge base
    └── engineering_runbook.md ← engineering knowledge base
```
