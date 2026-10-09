import { createHash } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";
import { emptyDb, type DbShape } from "../../src/lib/dp/store";
import { storedRecords } from "./storage";
import type { Fueling } from "../../src/lib/dp/types";
const accountId = "00000000-0000-4000-8000-000000000001";
const f = (id: string, note = ""): Fueling => ({
  id,
  at: 1,
  odometer: 100,
  liters: 10,
  pricePerLiter: 5,
  totalValue: 50,
  station: "Posto",
  fullTank: true,
  fuelType: "gasolina",
  tripId: null,
  note,
  syncState: "local",
});
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=",
  "base64",
);
const photo = {
  id: "photoA",
  tripId: null,
  fuelingId: null,
  category: "painel" as const,
  fileName: "original.png",
  mimeType: "image/png",
  sizeBytes: png.length,
  capturedAt: 1,
  lat: null,
  lon: null,
  sha256: createHash("sha256").update(png).digest("hex"),
  inAppCapture: true,
  note: "",
  syncState: "local" as const,
};
async function fixture(
  context: BrowserContext,
  initial: DbShape,
  cloud: { revision: number; snapshot: DbShape },
) {
  await context.addInitScript(
    ({ initial, accountId }) => {
      if (localStorage.getItem("carvrum:e2e-initialized")) return;
      localStorage.setItem("carvrum:e2e-initialized", "yes");
      const user = {
        id: accountId,
        email: "fixture@example.invalid",
        aud: "authenticated",
        role: "authenticated",
        app_metadata: { provider: "google" },
        user_metadata: {},
        created_at: new Date().toISOString(),
      };
      const expires = Math.floor(Date.now() / 1000) + 3600;
      const token =
        btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=+$/, "") +
        "." +
        btoa(
          JSON.stringify({
            sub: accountId,
            session_id: "fixture-session-" + accountId,
            aud: "authenticated",
            exp: expires,
          }),
        ).replace(/=+$/, "") +
        ".fixture";
      localStorage.setItem(
        "sb-pylmernfpgcwxylzcbqi-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "fixture-only",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: expires,
          user,
        }),
      );
      localStorage.setItem("driveproof:v1", JSON.stringify(initial));
    },
    { initial, accountId },
  );
  await context.route("https://pylmernfpgcwxylzcbqi.supabase.co/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname === "/auth/v1/logout") {
      await route.fulfill({ status: 204 });
    } else if (url.pathname === "/auth/v1/user") {
      const authorization = request.headers()["authorization"] ?? "";
      const payload = authorization.split(".")[1];
      const fixtureId = payload
        ? JSON.parse(Buffer.from(payload, "base64").toString()).sub
        : accountId;
      await route.fulfill({
        json: {
          id: fixtureId,
          email: "fixture@example.invalid",
          aud: "authenticated",
          role: "authenticated",
          app_metadata: { provider: "google" },
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      });
    } else if (url.pathname === "/rest/v1/cloud_sync_state") {
      await route.fulfill({
        json: [{ ...cloud, user_id: accountId, updated_at: new Date().toISOString() }],
      });
    } else if (url.pathname === "/rest/v1/rpc/cloud_sync_upload_v2") {
      const body = request.postDataJSON();
      if (body.expected_revision !== cloud.revision) await route.fulfill({ json: null });
      else {
        cloud.revision++;
        cloud.snapshot = body.new_snapshot;
        await route.fulfill({ json: cloud.revision });
      }
    } else if (url.pathname.startsWith("/storage/v1/object/") && request.method() === "GET") {
      await route.fulfill({ body: png, contentType: "image/png" });
    } else
      await route.fulfill({
        status: 400,
        json: { message: "Unexpected request in isolated test: " + url.pathname },
      });
  });
}

test("restores metadata on a new device and recovers the original with SHA-256", async ({
  page,
  context,
}) => {
  const cloud = {
    revision: 3,
    snapshot: { ...emptyDb(), fuelings: [f("fuelA")], evidences: [photo] },
  };
  await fixture(context, emptyDb(), cloud);
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await expect(page.getByText("Conectado como")).toBeVisible();
  await page.getByRole("button", { name: "Recuperar registros da nuvem", exact: true }).click();
  await expect.poll(() => storedRecords(page, accountId).then((db) => db.evidences.length)).toBe(1);
  await page.getByRole("button", { name: "Recuperar fotos ausentes neste aparelho" }).click();
  await expect(page.getByText(/1 foto\(s\) recuperada\(s\)/)).toBeVisible();
  const recovered = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("driveproof", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const blob = await new Promise<Blob>((resolve, reject) => {
      const r = db
        .transaction("evidence-blobs")
        .objectStore("evidence-blobs")
        .get("00000000-0000-4000-8000-000000000001:photoA");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())),
    )
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  });
  expect(recovered).toBe(photo.sha256);
  // A divergent local copy must be preserved before repair, never silently destroyed.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("driveproof", 1);
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("evidence-blobs", "readwrite");
      tx.objectStore("evidence-blobs").put(
        new Blob(["divergent-local-bytes"], { type: "image/png" }),
        "00000000-0000-4000-8000-000000000001:photoA",
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
  await page.getByRole("button", { name: "Conferir e reparar originais inválidos" }).click();
  await expect(page.getByText(/1 original\(is\) recuperado\(s\)\/reparado\(s\)/)).toBeVisible();
  const repaired = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("driveproof", 1);
      r.onsuccess = () => resolve(r.result);
    });
    const rows = await new Promise<{ key: string; blob: Blob }[]>((resolve) => {
      const result: { key: string; blob: Blob }[] = [],
        tx = db.transaction("evidence-blobs"),
        request = tx.objectStore("evidence-blobs").openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          result.push({ key: String(cursor.key), blob: cursor.value });
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve(result);
    });
    const original = rows.find((x) => x.key.endsWith(":photoA"))!,
      preserved = rows.find((x) => x.key.includes(":quarantine:photoA:"))!;
    return {
      digest: Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", await original.blob.arrayBuffer())),
      )
        .map((x) => x.toString(16).padStart(2, "0"))
        .join(""),
      preserved: await preserved.blob.text(),
    };
  });
  expect(repaired).toEqual({ digest: photo.sha256, preserved: "divergent-local-bytes" });
});

test("explicitly resolves a content conflict and preserves both reviewed versions", async ({
  page,
  context,
}) => {
  const local = { ...emptyDb(), fuelings: [f("A", "local version")] };
  const cloud = { revision: 2, snapshot: { ...emptyDb(), fuelings: [f("A", "cloud version")] } };
  await fixture(context, local, cloud);
  await page.goto("/");
  await expect(page.getByText("Conectado como")).toBeVisible();
  await page.getByRole("button", { name: "Verificar e conciliar registros" }).click();
  await expect(page.getByText("Conflitos aguardam sua escolha")).toBeVisible();
  await page.getByRole("radio", { name: /^Usar da nuvem:/ }).check();
  await page.getByRole("button", { name: "Aplicar versões escolhidas e sincronizar" }).click();
  await expect
    .poll(() => storedRecords(page, accountId).then((db) => db.fuelings[0].note))
    .toBe("cloud version");
  const review = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("carvrum-records", 1);
      r.onsuccess = () => resolve(r.result);
    });
    return new Promise<any[]>((resolve) => {
      const r = db.transaction("reviews").objectStore("reviews").getAll();
      r.onsuccess = () => {
        resolve(r.result);
        db.close();
      };
    });
  });
  await expect(page.getByRole("button", { name: "Exportar as duas versões" })).toBeVisible();
  expect(review).toHaveLength(1);
  expect(review[0].local.fuelings[0].note).toBe("local version");
  expect(review[0].cloud.fuelings[0].note).toBe("cloud version");
});

test("does not overwrite a device that already contains records during restore", async ({
  page,
  context,
}) => {
  const local = { ...emptyDb(), fuelings: [f("localA")] };
  await fixture(context, local, {
    revision: 2,
    snapshot: { ...emptyDb(), fuelings: [f("cloudB")] },
  });
  await page.goto("/");
  await expect(page.getByText("Conectado como")).toBeVisible();
  await page.getByRole("button", { name: "Recuperar registros da nuvem", exact: true }).click();
  await expect(
    page.getByText(/Recuperação bloqueada: este aparelho já possui registros/),
  ).toBeVisible();
  expect(await storedRecords(page, accountId).then((db) => db.fuelings[0].id)).toBe("localA");
});

test("two isolated devices converge after concurrent additions without losing either record", async ({
  browser,
}) => {
  const cloud = { revision: 1, snapshot: emptyDb() };
  const first = await browser.newContext(),
    second = await browser.newContext();
  try {
    await fixture(first, { ...emptyDb(), fuelings: [f("fromA")] }, cloud);
    await fixture(second, { ...emptyDb(), fuelings: [f("fromB")] }, cloud);
    for (const context of [first, second])
      await context.addInitScript(
        ({ accountId }) => {
          const snapshot = {
            version: 1,
            trips: [],
            fuelings: [],
            evidences: [],
            stations: [],
            vehicle: {
              name: "Meu veículo",
              plate: "",
              recommendedFrontPsi: null,
              recommendedRearPsi: null,
              tankLiters: null,
            },
            activeTripId: null,
            demoSeeded: false,
            notifPausedUntil: null,
          };
          localStorage.setItem("driveproof:auto-sync:revision:" + accountId, "1");
          localStorage.setItem(
            "driveproof:sync-base:" + accountId,
            JSON.stringify({ revision: 1, snapshot }),
          );
        },
        { accountId },
      );
    const a = await first.newPage(),
      b = await second.newPage();
    await a.goto("http://127.0.0.1:3000/");
    await b.goto("http://127.0.0.1:3000/");
    await expect(a.getByText("Conectado como")).toBeVisible();
    await expect(b.getByText("Conectado como")).toBeVisible();
    await Promise.all([
      a.getByRole("button", { name: "Verificar e conciliar registros" }).click(),
      b.getByRole("button", { name: "Verificar e conciliar registros" }).click(),
    ]);
    for (const page of [a, b, a]) {
      await expect(
        page.getByRole("button", { name: "Verificar e conciliar registros" }),
      ).toBeEnabled();
      await page.getByRole("button", { name: "Verificar e conciliar registros" }).click();
      await expect(
        page.getByRole("button", { name: "Verificar e conciliar registros" }),
      ).toBeEnabled();
    }
    for (const page of [a, b])
      await expect
        .poll(() =>
          storedRecords(page, accountId).then((db) =>
            db.fuelings.map((x: { id: string }) => x.id).sort(),
          ),
        )
        .toEqual(["fromA", "fromB"]);
    expect(cloud.snapshot.fuelings.map((x) => x.id).sort()).toEqual(["fromA", "fromB"]);
  } finally {
    await first.close();
    await second.close();
  }
});

test("logout hides the account and another login opens a separate vault", async ({
  page,
  context,
}) => {
  await fixture(
    context,
    { ...emptyDb(), fuelings: [f("privateA", "Only owner A")] },
    { revision: 1, snapshot: emptyDb() },
  );
  await page.goto("/");
  await expect(page.getByText("Conectado como")).toBeVisible();
  await page.getByRole("button", { name: "Sair da conta", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Continuar com Google (Gmail)", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Abastec.", exact: true }).click();
  await expect(page.getByText("Only owner A", { exact: true })).toHaveCount(0);
  expect((await storedRecords(page, accountId)).fuelings[0].id).toBe("privateA");
  const login = async (id: string) => {
    await page.evaluate(async (id) => {
      const expires = Math.floor(Date.now() / 1000) + 3600;
      const token =
        btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=+$/, "") +
        "." +
        btoa(
          JSON.stringify({
            sub: id,
            session_id: "fixture-session-" + id,
            aud: "authenticated",
            exp: expires,
          }),
        ).replace(/=+$/, "") +
        ".fixture";
      localStorage.setItem(
        "sb-pylmernfpgcwxylzcbqi-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "fixture-only",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: expires,
          user: {
            id,
            email: "fixture@example.invalid",
            aud: "authenticated",
            role: "authenticated",
            app_metadata: {},
            user_metadata: {},
            created_at: new Date().toISOString(),
          },
        }),
      );
    }, id);
  };
  await login("00000000-0000-4000-8000-000000000002");
  await page.goto("/");
  await expect(page.getByText("Conectado como")).toBeVisible();
  expect((await storedRecords(page, "00000000-0000-4000-8000-000000000002")).fuelings).toHaveLength(
    0,
  );
  await login(accountId);
  await page.goto("/abastecimentos");
  await expect(page.getByText("Only owner A", { exact: true })).toBeVisible();
});

test("a previously verified account reopens offline without exposing another vault", async ({
  page,
  context,
}) => {
  await fixture(
    context,
    { ...emptyDb(), fuelings: [f("offlineA", "Persisted offline record")] },
    { revision: 1, snapshot: emptyDb() },
  );
  await page.goto("/abastecimentos");
  await expect(page.getByText("Persisted offline record", { exact: true })).toBeVisible();
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false }),
  );
  await context.unroute("https://pylmernfpgcwxylzcbqi.supabase.co/**");
  let remoteRequests = 0;
  await context.route("https://pylmernfpgcwxylzcbqi.supabase.co/**", async (route) => {
    remoteRequests++;
    await route.abort();
  });
  await page.reload();
  await expect(page.getByText("Persisted offline record", { exact: true })).toBeVisible();
  expect(remoteRequests).toBe(0);
});
