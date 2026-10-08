import "fake-indexeddb/auto";
import { beforeEach } from "vitest";
import { deleteLocalScope } from "../src/lib/dp/localRecords";
beforeEach(async () => {
  for (const scope of ["guest", "guest-private-empty", "accountA", "accountB"])
    await deleteLocalScope(scope);
});
