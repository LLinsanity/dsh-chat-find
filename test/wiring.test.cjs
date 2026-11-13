/**
 * Offline wiring check for the conversation-find Client module.
 *
 * Loads client.js in a VM with stubbed React / module loader / context, then
 * asserts that the plugin registers its overlay slot, its Ctrl+F command, and
 * its locale dictionaries. DOM behaviour is exercised by the running app.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');

let captured = null;
const windowStub = {
  __ModuleLoader__: {
    load(spec) {
      captured = spec;
    },
  },
};

const reactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [initial, () => {}],
  useRef: (initial) => ({ current: initial }),
  useEffect: () => {},
};

const sandbox = {
  window: windowStub,
  document: { querySelector: () => null, querySelectorAll: () => [], createRange: () => ({}) },
  CSS: undefined,
  console,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
};
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'client.js' });

if (captured === null) throw new Error('module loader was not called');
if (captured.id !== 'dsh-chat-find') throw new Error('unexpected module id: ' + captured.id);

const mod = captured.factory((name) => {
  if (name === 'react') return reactStub;
  throw new Error('unexpected require: ' + name);
});

if (typeof mod.apply !== 'function') throw new Error('factory did not return apply()');

const registrations = [];
const commands = [];
const effects = [];
const dicts = [];

const ctx = {
  slots: {
    inject(slot, body) {
      if (slot !== 'shell.overlay') throw new Error('unexpected slot: ' + slot);
      return body();
    },
    register(options, component) {
      registrations.push({ options, component });
      return () => {};
    },
  },
  locale: {
    bind: () => (key) => key,
    register(ns, dictionaries) {
      dicts.push({ ns, dictionaries });
      return () => {};
    },
  },
  effect(fn, label) {
    effects.push(label);
    const dispose = fn();
    return typeof dispose === 'function' ? dispose : () => {};
  },
  inject(names, body) {
    if (names.join(',') !== 'shortcuts') throw new Error('unexpected inject: ' + names);
    body({
      effect: (fn, label) => {
        effects.push(label);
        return fn();
      },
      shortcuts: {
        register(command) {
          commands.push(command);
          return () => {};
        },
      },
    });
  },
};

mod.apply(ctx);

const checks = [
  ['overlay slot registered', registrations.length === 1 && registrations[0].options.name === 'shell.overlay'],
  ['overlay id', registrations[0] && registrations[0].options.id === 'conversation-find'],
  ['component is a function', typeof registrations[0].component === 'function'],
  ['one shortcut command', commands.length === 1],
  ['command id', commands[0] && commands[0].id === 'conversation.find'],
  ['desktop:windows KeyF primary', JSON.stringify(commands[0] && commands[0].defaults['desktop:windows']) === JSON.stringify({ code: 'KeyF', modifiers: ['primary'] })],
  ['no web default', commands[0] && !commands[0].defaults['web:windows']],
  ['editable region', commands[0] && commands[0].regions.indexOf('editable') !== -1],
  ['locale registered', dicts.length === 1 && dicts[0].ns === 'conversation-find'],
  ['en + zh dictionaries', dicts[0] && !!dicts[0].dictionaries.en && !!dicts[0].dictionaries.zh],
  ['zh translate present', dicts[0] && dicts[0].dictionaries.zh['command.find'] === '在对话中查找'],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log((ok ? 'ok   ' : 'FAIL ') + name);
}

// The command must resolve to a handled action that opens the bar.
const resolved = commands[0].resolve({});
if (resolved.status !== 'handled' || typeof resolved.run !== 'function') {
  failed += 1;
  console.log('FAIL command resolves to a handled action');
} else {
  console.log('ok   command resolves to a handled action');
}

if (failed > 0) {
  console.error(`${failed} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('all wiring checks passed');
}
