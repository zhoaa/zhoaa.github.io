(() => {
  const form = document.getElementById('birds-command-form');
  const input = document.getElementById('birds-command-input');
  const output = document.getElementById('terminal-output');
  const terminal = document.getElementById('birds-terminal');
  const commands = new Map(Object.entries(window.birdsCommands || {}).map(([name, text]) => [name.trim().toLowerCase(), String(text)]));
  const names = [...commands.keys()].filter(Boolean);
  const escaped = [...names].sort((a, b) => b.length - a.length).map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const references = new RegExp(`(^|[^\\p{L}\\p{N}_-])(${escaped.join('|')})(?=$|[^\\p{L}\\p{N}_-])`, 'giu');
  const history = [];
  let historyIndex = 0;
  let draft = '';

  function print(text, typed = false) {
    const line = document.createElement('div');
    line.className = `terminal-line${typed ? ' terminal-command' : ''}`;
    if (typed) {
      const prompt = document.createElement('span');
      prompt.className = 'terminal-prompt';
      prompt.textContent = '>';
      line.append(prompt, document.createTextNode(text));
    } else {
      let end = 0;
      for (const match of names.length ? text.matchAll(references) : []) {
        const start = match.index + match[1].length;
        line.append(document.createTextNode(text.slice(end, start)));
        const word = document.createElement('strong');
        word.className = 'terminal-command-name';
        word.textContent = match[2];
        line.append(word);
        end = start + match[2].length;
      }
      line.append(document.createTextNode(text.slice(end)));
    }
    output.append(line);
    while (output.childElementCount > 300) output.firstElementChild.remove();
    terminal.scrollTop = terminal.scrollHeight;
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!input.value.trim()) return;
    const value = input.value;
    input.value = '';
    print(value, true);
    history.push(value);
    historyIndex = history.length;
    draft = '';
    const command = value.trim().toLowerCase();
    if (commands.has(command)) print(commands.get(command));
    else print('Unknown command.');
    terminal.scrollTop = terminal.scrollHeight;
  });
  input.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    if (historyIndex === history.length) draft = input.value;
    historyIndex = Math.max(0, Math.min(history.length, historyIndex + (event.key === 'ArrowUp' ? -1 : 1)));
    input.value = historyIndex === history.length ? draft : history[historyIndex];
    input.setSelectionRange(input.value.length, input.value.length);
  });
  terminal.addEventListener('click', () => {
    if (!window.getSelection().toString()) input.focus();
  });
})();
