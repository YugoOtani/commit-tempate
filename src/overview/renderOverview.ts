import type { ChangeReview } from "../review/schema";

export function renderOverview(review: ChangeReview, nonce: string): string {
  const implementation = review.overview.implementation
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const flows = review.flows.length > 0
    ? review.flows.map(renderFlow).join("")
    : '<p class="empty">利用可能なFlowはありません。</p>';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>${escapeHtml(review.change.title)}</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    body {
      max-width: 860px;
      margin: 0 auto;
      padding: 32px 28px 48px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      line-height: 1.55;
    }
    h1 { margin: 0 0 32px; font-size: 1.8rem; }
    h2 { margin: 0 0 24px; font-size: 1.35rem; }
    h3 { margin: 28px 0 10px; font-size: 1rem; }
    ul { margin: 0; padding-left: 1.4rem; }
    li + li { margin-top: 6px; }
    .flow-list { display: grid; gap: 12px; }
    .flow {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 16px;
      padding: 16px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      background: var(--vscode-sideBar-background);
    }
    .flow h4 { margin: 0; font-size: 1rem; }
    .flow p { margin: 4px 0 0; color: var(--vscode-descriptionForeground); }
    button {
      padding: 6px 14px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 2px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      cursor: pointer;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
    .empty { color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <header><h1>${escapeHtml(review.change.title)}</h1></header>
  <main>
    <h2>Implementation Overview</h2>
    <section aria-labelledby="summary-heading">
      <h3 id="summary-heading">Summary</h3>
      <p>${escapeHtml(review.overview.summary)}</p>
    </section>
    <section aria-labelledby="implementation-heading">
      <h3 id="implementation-heading">Implementation</h3>
      <ul>${implementation}</ul>
    </section>
    <section aria-labelledby="flows-heading">
      <h3 id="flows-heading">Flows</h3>
      <div class="flow-list">${flows}</div>
    </section>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) {
        return;
      }
      const flowId = target.dataset.flowId;
      if (flowId) {
        vscode.postMessage({ type: "openFlow", flowId });
      }
    });
  </script>
</body>
</html>`;
}

function renderFlow(flow: ChangeReview["flows"][number]): string {
  const description = flow.description
    ? `<p>${escapeHtml(flow.description)}</p>`
    : "";
  return `<article class="flow">
    <div>
      <h4>${escapeHtml(flow.title)}</h4>
      ${description}
      <p>${flow.steps.length} steps</p>
    </div>
    <button type="button" data-flow-id="${escapeHtml(flow.id)}" aria-label="${escapeHtml(flow.title)}を開く">Open</button>
  </article>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });
}
