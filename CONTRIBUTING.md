# Contributing

## Commits

One logical change per commit. Tests pass before each commit (`cd tools && npm test`).

## Testing

```bash
cd tools && npm install && npm test        # unit tests (no hardware)
npm run hitl                                # hardware-in-the-loop (probe required)
npm run hitl-flash --flash-test             # destructive flash tests
npm run hitl-recovery --recovery-test       # destructive recovery tests
```

## CI

Push to any branch: unit tests run automatically. Merge to `main`: tests must pass before deploy.
