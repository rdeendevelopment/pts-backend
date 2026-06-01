# Reference module (not mounted)

This folder demonstrates the **required v2 module layout**.

It is **not registered** in `src/v2/index.js` and has **no public API endpoint**.

Copy this structure when implementing real modules (`auth`, `modules`, `users`, `projects`, …).

```text
src/v2/modules/example/
├── index.js
├── example.routes.js
├── controllers/
├── services/
├── repositories/
├── models/
├── schemas/
├── validators/
├── dto/
├── helpers/
├── constants/
├── errors/
└── tests/
```

See [v2-engineering-standards.md](../../../docs/v2-engineering-standards.md) for layer rules.
