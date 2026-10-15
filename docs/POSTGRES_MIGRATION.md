# PostgreSQL entropy migration review correction

The previous migration path recursively called `Execute` after committing its migration transaction while retaining the outer pooled connection. With `Maximum Pool Size=1`, that recursive call could wait for its own connection slot and time out.

`PostgresGameStore.Execute` now retains one connection and loops over scoped transactions. It commits entropy migration, disposes the migration transaction and commands, starts a fresh transaction on the same connection, locks and rereads the current campaign, and only then invokes the requested operation. A failed operation cannot roll back the separately committed entropy migration. No second connection is required and no stale pre-commit state reaches the operation.

The optional PostgreSQL integration suite now includes a single-slot pool fixture with a three-second acquisition timeout. In the explicitly disposable test database it removes entropy, migrates during a deliberately failed operation, and checks persisted entropy after reopening. Run with `DEEPFIELD_TEST_POSTGRES` set only to a disposable database, using the normal checks executable.

Compilation is verified. PostgreSQL runtime execution is **not verified** in this environment because no test server is available; the fixture is skipped without that environment variable. No live database or running playtest was changed.
