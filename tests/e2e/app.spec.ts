import { expect, test } from "@playwright/test";

test("mobile navigation renders and supports creating and finishing a trip", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle(/CARVRUM/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Viagem", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nova viagem", exact: true })).toBeVisible();
  await page
    .getByText("Hodômetro inicial (km)", { exact: true })
    .locator("..")
    .locator("input")
    .fill("1000");
  await page.getByRole("button", { name: "Iniciar viagem agora" }).click();
  await expect(
    page.getByRole("heading", { name: "Viagem em andamento", exact: true }),
  ).toBeVisible();
  await page
    .getByText("Hodômetro final (km)", { exact: true })
    .locator("..")
    .locator("input")
    .fill("1010");
  await page.getByRole("button", { name: "Encerrar viagem", exact: true }).last().click();
  await expect(page).toHaveURL(/historico\/trip_/);
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem("driveproof:v1")!));
  expect(records.activeTripId).toBeNull();
  expect(records.trips[0].finished).toBe(true);
  expect(records.trips[0].odometerEnd).toBe(1010);
  expect(errors).toEqual([]);
});

test("refuses negative initial odometer and preserves the empty device", async ({ page }) => {
  await page.goto("/viagem");
  await page
    .getByText("Hodômetro inicial (km)", { exact: true })
    .locator("..")
    .locator("input")
    .fill("-1");
  await page.getByRole("button", { name: "Iniciar viagem agora" }).click();
  await expect(page.getByText("Informe um hodômetro inicial válido.")).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("driveproof:v1") ?? '{"trips":[]}').trips.length,
    ),
  ).toBe(0);
});

test("history and reports render without data or application errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of ["/historico", "/abastecimentos", "/relatorios", "/metodologia"]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(errors).toEqual([]);
});
