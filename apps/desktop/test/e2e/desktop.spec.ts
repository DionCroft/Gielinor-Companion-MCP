import { expect, test } from "@playwright/test";

test("first-run creates a local normal profile", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /plan with confidence/i })).toBeVisible();
  await page.getByLabel(/runescape display name/i).fill("Local Hero");
  await page.getByRole("button", { name: /continue to companion/i }).click();
  await expect(page.getByRole("heading", { name: /welcome back, local hero/i })).toBeVisible();
});

test("multiple profile creation works from the profile manager", async ({ page }) => {
  await page.goto("/?fixture=returning");
  await page.getByRole("button", { name: "Player profiles" }).click();
  await page.getByRole("button", { name: "Add profile", exact: true }).first().click();
  await page
    .getByRole("dialog")
    .getByLabel(/runescape display name/i)
    .fill("Second Hero");
  await page.getByRole("button", { name: "Create local profile" }).click();
  await expect(page.getByRole("heading", { name: "Second Hero" })).toBeVisible();
});

test("quest route and checklist are usable", async ({ page }) => {
  await page.goto("/?fixture=returning");
  await page.getByRole("button", { name: "Quest planner", exact: true }).click();
  await page.getByLabel("Search quests").fill("plague");
  await page.getByRole("button", { name: "Run quest search" }).click();
  await page.getByRole("button", { name: /plague's end/i }).click();
  await expect(page.getByRole("tab", { name: "Dependency route" })).toBeVisible();
  await page.getByRole("tab", { name: "Checklist" }).click();
  await page.getByRole("checkbox").first().check();
  await expect(page.getByRole("checkbox").first()).toBeChecked();
});

test("levelling planner returns explainable stages", async ({ page }) => {
  await page.goto("/?fixture=returning");
  await page.getByRole("button", { name: "Levelling", exact: true }).click();
  await page.getByLabel("Target level").fill("90");
  await page.getByRole("button", { name: "Create levelling plan" }).click();
  await expect(page.getByText("Concentrated sandstone")).toBeVisible();
  await expect(page.getByText("Seren stones")).toBeVisible();
});

test("Grand Exchange shows a sourced price chart", async ({ page }) => {
  await page.goto("/?fixture=returning");
  await page.getByRole("button", { name: "Grand Exchange" }).click();
  await page.getByLabel("Search Grand Exchange items").fill("whip");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: /abyssal whip/i }).click();
  await expect(page.getByRole("img", { name: /abyssal whip guide-price history/i })).toBeVisible();
  await expect(page.getByText(/instant order book/i)).toBeVisible();
});

test("offline mode keeps cached data visible", async ({ page }) => {
  await page.goto("/?fixture=offline");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("switch", { name: /use retained local data only/i }).check();
  await page.getByRole("button", { name: "Data sources" }).click();
  await expect(page.getByText(/offline mode is active/i)).toBeVisible();
  await expect(page.getByText("7,310")).toBeVisible();
});

test("provider failures are explicit and retained profile setup still succeeds", async ({
  page,
}) => {
  await page.goto("/?fixture=provider-error");
  await page.getByLabel(/runescape display name/i).fill("Offline Hero");
  await page.getByRole("button", { name: /continue to companion/i }).click();
  await expect(page.getByRole("heading", { name: /welcome back, offline hero/i })).toBeVisible();
  await page.getByRole("button", { name: "Data sources" }).click();
  await page.getByRole("button", { name: /refresh quest catalogue/i }).click();
  await expect(page.getByRole("alert")).toContainText(/temporarily unavailable/i);
});

test("settings and goals survive a reload", async ({ page }) => {
  await page.goto("/?fixture=returning");
  await page.getByRole("button", { name: "Goals" }).click();
  await page.getByLabel("Goal").fill("Reach level 99");
  await page.getByLabel("Target or note").fill("Mining");
  await page.getByRole("button", { name: "Add local goal" }).click();
  await expect(page.getByText("Reach level 99")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Goals" }).click();
  await expect(page.getByText("Reach level 99")).toBeVisible();
});
