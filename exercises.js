(() => {
  const root = document.getElementById('exercises');
  const exercises = root && window.EXERCISES && window.EXERCISES[root.dataset.page];
  if (!exercises) return;

  const STORAGE_KEY = 'html-tutorial-progress';
  const BASE_STYLE = '<style>body{font-family:system-ui,sans-serif;margin:12px;color:#1d2433}</style>';

  const SHIM = `<script>
    (() => {
      window.__logs = [];
      const fmt = (v) => {
        if (v instanceof Error) return v.message;
        if (typeof v === 'object' && v !== null) {
          try { return JSON.stringify(v); } catch { return String(v); }
        }
        return String(v);
      };
      const send = (level, args) => {
        const text = args.map(fmt).join(' ');
        window.__logs.push(text);
        parent.postMessage({ source: 'ex-console', level, text }, '*');
      };
      ['log', 'info', 'warn', 'error'].forEach((level) => {
        console[level] = (...args) => send(level, args);
      });
      window.addEventListener('error', (e) => send('error', [e.message]));
    })();
  <\/script>`;

  const harness = (tests) => `<script>
    window.addEventListener('load', () => setTimeout(() => {
      const doc = document;
      const $ = (s) => doc.querySelector(s);
      const $$ = (s) => [...doc.querySelectorAll(s)];
      const css = (s, p) => { const el = $(s); return el ? getComputedStyle(el)[p] : null; };
      const rgb = (c) => {
        const probe = doc.createElement('span');
        probe.style.color = c;
        doc.body.appendChild(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      };
      const logs = window.__logs;
      const results = ${JSON.stringify(tests).replace(/</g, '\\u003c')}.map(([desc, body]) => {
        try {
          return { desc, pass: !!new Function('$', '$$', 'css', 'rgb', 'logs', 'doc', body)($, $$, css, rgb, logs, doc) };
        } catch (e) {
          return { desc, pass: false };
        }
      });
      parent.postMessage({ source: 'ex-check', results }, '*');
    }, 0));
  <\/script>`;

  const readProgress = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  };

  const writeProgress = (progress) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {
      /* progress simply will not persist */
    }
  };

  const format = (text) => {
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped.replace(/`([^`]+)`/g, '<code class="inline">$1</code>');
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const progress = readProgress();
  const progressLabel = document.getElementById('ex-progress');
  const list = document.getElementById('ex-list');

  const updateSummary = () => {
    const done = exercises.filter((_, i) => progress[`${root.dataset.page}-${i}`]).length;
    progressLabel.textContent = `${done} of ${exercises.length} completed`;
  };

  exercises.forEach((exercise, index) => {
    const id = `${root.dataset.page}-${index}`;
    const card = el('article', 'exercise');

    const heading = el('h3', null, `Exercise ${index + 1}: ${exercise.title}`);
    const badge = el('span', 'badge', 'Completed');
    badge.hidden = !progress[id];
    heading.appendChild(badge);

    const instructions = el('p');
    instructions.innerHTML = format(exercise.instructions);

    const editorPane = el('div');
    editorPane.appendChild(el('div', 'pane-label', 'Your code'));
    const editor = el('textarea');
    editor.value = exercise.starter;
    editor.spellcheck = false;
    editor.setAttribute('aria-label', `Code for exercise ${index + 1}`);
    const actions = el('div', 'actions');
    const checkButton = el('button', 'check', 'Check my answer');
    checkButton.type = 'button';
    const resetButton = el('button', 'reset', 'Reset');
    resetButton.type = 'button';
    actions.append(checkButton, resetButton);
    editorPane.append(editor, actions);

    const resultPane = el('div');
    resultPane.appendChild(el('div', 'pane-label', 'Result'));
    const frame = el('iframe');
    frame.title = `Result for exercise ${index + 1}`;
    frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals');
    resultPane.appendChild(frame);
    const consoleOut = el('pre', 'console-out');
    consoleOut.hidden = true;
    if (exercise.console) resultPane.appendChild(consoleOut);

    const playground = el('div', 'playground');
    playground.append(editorPane, resultPane);

    const feedback = el('ul', 'results');
    feedback.setAttribute('aria-live', 'polite');

    const hint = el('details');
    hint.appendChild(el('summary', null, 'Hint'));
    const hintText = el('p');
    hintText.innerHTML = format(exercise.hint);
    hint.appendChild(hintText);

    const solution = el('details');
    solution.appendChild(el('summary', null, 'Show solution'));
    const solutionCode = el('pre', 'static');
    solutionCode.appendChild(el('code', null, exercise.solution));
    solution.appendChild(solutionCode);

    card.append(heading, instructions, playground, feedback, hint, solution);
    list.appendChild(card);

    const render = (withTests) => {
      consoleOut.textContent = '';
      consoleOut.hidden = true;
      frame.srcdoc =
        '<!DOCTYPE html><html><head><meta charset="UTF-8">' + BASE_STYLE + SHIM + '</head><body>' +
        editor.value + (withTests ? harness(exercise.tests) : '') + '</body></html>';
    };

    let timer;
    editor.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => render(false), 400);
    });
    editor.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end');
    });
    checkButton.addEventListener('click', () => {
      feedback.replaceChildren(el('li', 'pending', 'Checking...'));
      render(true);
    });
    resetButton.addEventListener('click', () => {
      editor.value = exercise.starter;
      feedback.replaceChildren();
      render(false);
    });

    window.addEventListener('message', (event) => {
      const data = event.data;
      if (event.source !== frame.contentWindow || !data) return;

      if (data.source === 'ex-console') {
        consoleOut.hidden = false;
        consoleOut.textContent += (consoleOut.textContent ? '\n' : '') + data.text;
        return;
      }

      if (data.source !== 'ex-check') return;
      feedback.replaceChildren(
        ...data.results.map((result) => el('li', result.pass ? 'pass' : 'fail', `${result.pass ? '✓' : '✗'} ${result.desc}`))
      );
      const allPassed = data.results.every((result) => result.pass);
      const summary = el('li', allPassed ? 'summary pass' : 'summary fail',
        allPassed ? 'All checks passed. Nice work!' : `${data.results.filter((r) => r.pass).length} of ${data.results.length} checks passed. Keep going, or open the hint.`);
      feedback.appendChild(summary);
      if (allPassed) {
        progress[id] = true;
        writeProgress(progress);
        badge.hidden = false;
        updateSummary();
      }
    });

    render(false);
  });

  updateSummary();
})();
