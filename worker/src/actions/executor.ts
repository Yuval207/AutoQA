import { Page, BrowserContext, ConsoleMessage } from 'playwright';
import { TestAction, StepResult } from '../types.js';
import * as fs from 'fs';
import * as path from 'path';

export class ActionExecutor {
  private page: Page;
  private baseUrl: string;
  private artifactsDir: string;
  private runId: string;
  private consoleLogs: string[] = [];
  private networkErrors: Array<{ url: string; status: number; method: string }> = [];

  constructor(page: Page, baseUrl: string, artifactsDir: string, runId: string) {
    this.page = page;
    this.baseUrl = baseUrl;
    this.artifactsDir = artifactsDir;
    this.runId = runId;

    // Capture console errors
    this.page.on('console', (msg: ConsoleMessage) => {
      const text = msg.text();
      if (text.includes('favicon.ico')) return;
      if (msg.type() === 'error' || msg.type() === 'warning') {
        this.consoleLogs.push(`[${msg.type()}] ${text}`);
      }
    });

    // Capture failed network requests (ignore favicon.ico 404)
    this.page.on('response', (response) => {
      if (response.url().includes('favicon.ico')) return;
      if (response.status() >= 400) {
        this.networkErrors.push({
          url: response.url(),
          status: response.status(),
          method: response.request().method(),
        });
      }
    });

    this.page.on('pageerror', (error) => {
      this.consoleLogs.push(`[page-error] ${error.message}`);
    });
  }

  async executeAction(action: TestAction, stepIndex: number, executionId: string): Promise<StepResult> {
    const startTime = Date.now();
    const screenshotName = `${executionId}_step_${stepIndex}.png`;
    const screenshotDir = path.join(this.artifactsDir, this.runId);

    // Ensure directory exists
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const screenshotPath = path.join(screenshotDir, screenshotName);

    try {
      switch (action.type) {
        case 'NAVIGATE': {
          const url = this.resolveUrl(action.target || '/');
          await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
          await this.captureScreenshot(screenshotPath);
          return this.successStep(stepIndex, action, startTime, screenshotName);
        }

        case 'CLICK': {
          const locator = this.resolveLocator(action.target || '');
          await locator.first().click({ timeout: 10000 });
          await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
          await this.captureScreenshot(screenshotPath);
          return this.successStep(stepIndex, action, startTime, screenshotName);
        }

        case 'FILL': {
          const fieldLocator = this.resolveLocator(action.target || '');
          await fieldLocator.first().fill(action.value || '', { timeout: 10000 });
          return this.successStep(stepIndex, action, startTime, null);
        }

        case 'SELECT': {
          const selectLocator = this.resolveLocator(action.target || '');
          await selectLocator.first().selectOption(action.value || '', { timeout: 10000 });
          return this.successStep(stepIndex, action, startTime, null);
        }

        case 'CHECK': {
          const checkLocator = this.resolveLocator(action.target || '');
          await checkLocator.first().check({ timeout: 10000 });
          return this.successStep(stepIndex, action, startTime, null);
        }

        case 'UNCHECK': {
          const uncheckLocator = this.resolveLocator(action.target || '');
          await uncheckLocator.first().uncheck({ timeout: 10000 });
          return this.successStep(stepIndex, action, startTime, null);
        }

        case 'SUBMIT': {
          // Try to find and click a submit button
          const submitTarget = action.target || '';
          if (submitTarget.toLowerCase().includes('form')) {
            await this.page.locator('button[type="submit"], input[type="submit"]').first().click({ timeout: 10000 });
          } else {
            const submitLocator = this.resolveLocator(submitTarget);
            await submitLocator.click({ timeout: 10000 });
          }
          await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
          await this.captureScreenshot(screenshotPath);
          return this.successStep(stepIndex, action, startTime, screenshotName);
        }

        case 'ASSERT_TEXT': {
          const textToFind = (action.target || action.value || '').trim();
          let isVisible = false;
          try {
            isVisible = await this.page.getByText(textToFind, { exact: false }).first().isVisible({ timeout: 2000 }).catch(() => false);
          } catch {}

          if (!isVisible) {
            const bodyText = await this.page.innerText('body').catch(() => '');
            if (bodyText.toLowerCase().includes(textToFind.toLowerCase())) {
              isVisible = true;
            }
          }

          if (!isVisible) {
            const content = await this.page.content().catch(() => '');
            if (content.toLowerCase().includes(textToFind.toLowerCase())) {
              isVisible = true;
            }
          }

          if (!isVisible) {
            await this.captureScreenshot(screenshotPath);
            return this.failStep(stepIndex, action, startTime, screenshotName,
              `Expected text "${textToFind}" to be visible`,
              `Text "${textToFind}" was not found on the page`);
          }
          return this.successStep(stepIndex, action, startTime, null);
        }

        case 'ASSERT_VISIBLE': {
          const locatorTarget = this.resolveLocator(action.target || '');
          const visible = await locatorTarget.isVisible({ timeout: 10000 }).catch(() => false);
          if (!visible) {
            await this.captureScreenshot(screenshotPath);
            return this.failStep(stepIndex, action, startTime, screenshotName,
              `Expected "${action.target}" to be visible`,
              `Element was not found or not visible`);
          }
          return this.successStep(stepIndex, action, startTime, null);
        }

        case 'ASSERT_URL': {
          const expectedUrl = action.target || action.value || '';
          const currentUrl = this.page.url();
          const matches = currentUrl.includes(expectedUrl) || new URL(currentUrl).pathname === expectedUrl;
          if (!matches) {
            await this.captureScreenshot(screenshotPath);
            return this.failStep(stepIndex, action, startTime, screenshotName,
              `Expected URL to contain "${expectedUrl}"`,
              `Current URL: ${currentUrl}`);
          }
          return this.successStep(stepIndex, action, startTime, null);
        }

        case 'SCREENSHOT': {
          await this.captureScreenshot(screenshotPath);
          return this.successStep(stepIndex, action, startTime, screenshotName);
        }

        case 'CUSTOM': {
          console.log(`Custom action (not automated): ${action.description}`);
          return {
            stepIndex,
            actionType: action.type,
            actionTarget: action.description || null,
            actionValue: null,
            status: 'SKIPPED',
            expectedValue: null,
            actualValue: 'Custom action - requires manual implementation',
            errorMessage: null,
            screenshotPath: null,
            consoleLogs: null,
            networkErrors: null,
            durationMs: Date.now() - startTime,
          };
        }

        default:
          return {
            stepIndex,
            actionType: action.type,
            actionTarget: action.target || null,
            actionValue: action.value || null,
            status: 'ERROR',
            expectedValue: null,
            actualValue: null,
            errorMessage: `Unknown action type: ${action.type}`,
            screenshotPath: null,
            consoleLogs: null,
            networkErrors: null,
            durationMs: Date.now() - startTime,
          };
      }
    } catch (error: any) {
      await this.captureScreenshot(screenshotPath).catch(() => {});
      return {
        stepIndex,
        actionType: action.type,
        actionTarget: action.target || null,
        actionValue: action.value || null,
        status: 'ERROR',
        expectedValue: null,
        actualValue: null,
        errorMessage: error.message || String(error),
        screenshotPath: screenshotName,
        consoleLogs: this.consoleLogs.length > 0 ? JSON.stringify(this.consoleLogs.slice(-20)) : null,
        networkErrors: this.networkErrors.length > 0 ? JSON.stringify(this.networkErrors.slice(-10)) : null,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Executes assertions based on expected outcomes after all actions are done.
   */
  async executeAssertions(expectedOutcomes: Array<{ description: string; source: string }>, stepIndexStart: number, executionId: string): Promise<StepResult[]> {
    const results: StepResult[] = [];
    const screenshotDir = path.join(this.artifactsDir, this.runId);

    for (let i = 0; i < expectedOutcomes.length; i++) {
      const outcome = expectedOutcomes[i];
      const stepIndex = stepIndexStart + i;
      const startTime = Date.now();
      const screenshotName = `${executionId}_step_${stepIndex}.png`;
      const screenshotPath = path.join(screenshotDir, screenshotName);

      try {
        const passed = await this.checkExpectedOutcome(outcome.description);
        if (passed) {
          await this.captureScreenshot(screenshotPath).catch(() => {});
          results.push({
            stepIndex,
            actionType: 'ASSERTION',
            actionTarget: outcome.description,
            actionValue: null,
            status: 'PASSED',
            expectedValue: outcome.description,
            actualValue: 'Assertion passed',
            errorMessage: null,
            screenshotPath: screenshotName,
            consoleLogs: null,
            networkErrors: null,
            durationMs: Date.now() - startTime,
          });
        } else {
          await this.captureScreenshot(screenshotPath);
          results.push({
            stepIndex,
            actionType: 'ASSERTION',
            actionTarget: outcome.description,
            actionValue: null,
            status: 'FAILED',
            expectedValue: outcome.description,
            actualValue: 'Assertion failed - expected outcome not observed',
            errorMessage: `Expected: ${outcome.description}`,
            screenshotPath: screenshotName,
            consoleLogs: this.consoleLogs.length > 0 ? JSON.stringify(this.consoleLogs.slice(-20)) : null,
            networkErrors: this.networkErrors.length > 0 ? JSON.stringify(this.networkErrors.slice(-10)) : null,
            durationMs: Date.now() - startTime,
          });
        }
      } catch (error: any) {
        await this.captureScreenshot(screenshotPath).catch(() => {});
        results.push({
          stepIndex,
          actionType: 'ASSERTION',
          actionTarget: outcome.description,
          actionValue: null,
          status: 'ERROR',
          expectedValue: outcome.description,
          actualValue: null,
          errorMessage: error.message || String(error),
          screenshotPath: screenshotName,
          consoleLogs: null,
          networkErrors: null,
          durationMs: Date.now() - startTime,
        });
      }
    }

    return results;
  }

  private async checkExpectedOutcome(description: string): Promise<boolean> {
    const trimmed = description.trim();
    const lower = trimmed.toLowerCase();

    // 1. Direct text check: is the exact expected phrase visible on the page?
    try {
      const isDirectlyVisible = await this.page
        .getByText(trimmed, { exact: false })
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      if (isDirectlyVisible) {
        return true;
      }
    } catch {}

    // Check innerText of body (handles JSON responses and preformatted text)
    try {
      const bodyText = await this.page.innerText('body').catch(() => '');
      if (bodyText.toLowerCase().includes(lower)) {
        return true;
      }
    } catch {}

    // Check raw page HTML content
    try {
      const content = await this.page.content().catch(() => '');
      if (content.toLowerCase().includes(lower)) {
        return true;
      }
    } catch {}

    // 2. Check for URL/navigation assertions
    if (lower.includes("reaches") || lower.includes("redirected to") || lower.includes("navigate")) {
      const urlPart = description.replace(/.*(?:reaches|redirected to|navigat\w+ to)\s+(?:the\s+)?/i, "").trim();
      const currentUrl = this.page.url();
      if (currentUrl.toLowerCase().includes(urlPart.toLowerCase().replace(/\s+/g, ""))) {
        return true;
      }
      const title = await this.page.title();
      if (title.toLowerCase().includes(urlPart.toLowerCase())) {
        return true;
      }
      return await this.page.getByText(urlPart, { exact: false }).first()
        .isVisible({ timeout: 2000 }).catch(() => false);
    }

    // 3. Check for error message assertions (when expecting negative behavior)
    if (lower.includes("error") || lower.includes("invalid") || lower.includes("failed") || lower.includes("wrong")) {
      const hasError = await this.page
        .locator('[class*="error"], [role="alert"], .error, .alert-danger, .text-red, .text-danger')
        .first()
        .isVisible({ timeout: 2000 }).catch(() => false);
      if (hasError) return true;

      return await this.page.getByText(/error|invalid|incorrect|wrong|failed/i).first()
        .isVisible({ timeout: 2000 }).catch(() => false);
    }

    // 4. Check for quoted text in description
    const textMatch = description.match(/["\u201c]([^"\u201d]+)["\u201d]/);
    if (textMatch) {
      return await this.page.getByText(textMatch[1], { exact: false }).first()
        .isVisible({ timeout: 2000 }).catch(() => false);
    }

    // 5. Check for unauthenticated state
    if (lower.includes("unauthenticated") || lower.includes("remains on") || lower.includes("stays on")) {
      const url = this.page.url();
      if (url.includes("login") || url.includes("signin") || url.includes("auth")) {
        return true;
      }
      return await this.page.locator("form, [type=\"password\"]").first()
        .isVisible({ timeout: 2000 }).catch(() => false);
    }

    // If the expected outcome text was not visible, return false
    return false;
  }

  private resolveUrl(target: string): string {
    if (target.startsWith('http://') || target.startsWith('https://')) {
      return target;
    }
    // Handle "the login page", "login page", "/login" etc.
    const cleaned = target
      .replace(/^the\s+/i, '')
      .replace(/\s+page$/i, '')
      .replace(/\s+/g, '')
      .toLowerCase();

    const baseClean = this.baseUrl.replace(/\/+$/, '');
    if (cleaned === '/' || cleaned === 'home' || cleaned === 'homepage' || cleaned === '') {
      return baseClean;
    }
    const pathPart = cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
    return `${baseClean}${pathPart}`;
  }

  private resolveLocator(target: string) {
    if (!target) return this.page.locator('body');

    const cleanTarget = target.trim();
    if (cleanTarget.startsWith('#') || cleanTarget.startsWith('.') || cleanTarget.startsWith('[')) {
      return this.page.locator(cleanTarget);
    }

    const lowerTarget = cleanTarget.toLowerCase();
    const regex = new RegExp(cleanTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    // Button detection
    if (lowerTarget.includes('button') || lowerTarget.includes('btn')) {
      const buttonText = cleanTarget.replace(/\b(button|btn)\b/gi, '').trim();
      if (buttonText) {
        return this.page.getByRole('button', { name: new RegExp(buttonText, 'i') });
      }
      return this.page.getByRole('button').first();
    }

    // Link detection
    if (lowerTarget.includes('link')) {
      const linkText = cleanTarget.replace(/\b(link)\b/gi, '').trim();
      if (linkText) {
        return this.page.getByRole('link', { name: new RegExp(linkText, 'i') });
      }
    }

    // Input field detection
    const fieldPatterns = [
      /(?:the\s+)?(\w+)\s+(?:field|input|textbox)/i,
      /(?:the\s+)?(\w+)\s+(?:text\s*box)/i,
    ];
    for (const pattern of fieldPatterns) {
      const match = cleanTarget.match(pattern);
      if (match) {
        const fieldName = match[1];
        return this.page.locator(`input#${fieldName}, textarea#${fieldName}`).or(
          this.page.locator(`input[name="${fieldName}"], textarea[name="${fieldName}"]`).or(
            this.page.getByLabel(new RegExp(fieldName, 'i')).or(
              this.page.getByPlaceholder(new RegExp(fieldName, 'i')).or(
                this.page.locator(`#${fieldName}`)
              )
            )
          )
        ).first();
      }
    }

    // Try CSS id, name, testid, label, placeholder, button, or text with case-insensitive matching
    return this.page.locator(`input#${cleanTarget}, textarea#${cleanTarget}`).or(
      this.page.locator(`input[name="${cleanTarget}"], textarea[name="${cleanTarget}"]`).or(
        this.page.locator(`input[data-testid="${cleanTarget}"], textarea[data-testid="${cleanTarget}"]`).or(
          this.page.locator(`#${cleanTarget}`).or(
            this.page.locator(`[name="${cleanTarget}"]`).or(
              this.page.locator(`[data-testid="${cleanTarget}"]`).or(
                this.page.getByRole('button', { name: regex }).or(
                  this.page.getByRole('link', { name: regex }).or(
                    this.page.getByLabel(regex).or(
                      this.page.getByPlaceholder(regex).or(
                        this.page.getByText(regex)
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
    ).first();
  }

  private successStep(stepIndex: number, action: TestAction, startTime: number, screenshotName: string | null): StepResult {
    return {
      stepIndex,
      actionType: action.type,
      actionTarget: action.target || null,
      actionValue: action.value || null,
      status: 'PASSED',
      expectedValue: null,
      actualValue: 'Action completed successfully',
      errorMessage: null,
      screenshotPath: screenshotName,
      consoleLogs: null,
      networkErrors: null,
      durationMs: Date.now() - startTime,
    };
  }

  private failStep(stepIndex: number, action: TestAction, startTime: number, screenshotName: string | null,
    expected: string, actual: string): StepResult {
    return {
      stepIndex,
      actionType: action.type,
      actionTarget: action.target || null,
      actionValue: action.value || null,
      status: 'FAILED',
      expectedValue: expected,
      actualValue: actual,
      errorMessage: `Assertion failed: ${expected}`,
      screenshotPath: screenshotName,
      consoleLogs: this.consoleLogs.length > 0 ? JSON.stringify(this.consoleLogs.slice(-20)) : null,
      networkErrors: this.networkErrors.length > 0 ? JSON.stringify(this.networkErrors.slice(-10)) : null,
      durationMs: Date.now() - startTime,
    };
  }

  private async captureScreenshot(filePath: string): Promise<void> {
    try {
      await this.page.screenshot({ path: filePath, fullPage: true });
    } catch (e) {
      console.error('Screenshot capture failed:', e);
    }
  }

  getConsoleLogs(): string[] {
    return [...this.consoleLogs];
  }

  getNetworkErrors(): Array<{ url: string; status: number; method: string }> {
    return [...this.networkErrors];
  }
}
