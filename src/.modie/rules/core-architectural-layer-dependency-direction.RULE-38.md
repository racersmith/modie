---
links: 

---

Modules within core must follow strict unidirectional dependency flow: domain primitives must not import engine or platform modules, and engine services must consume platform features through abstractions.
