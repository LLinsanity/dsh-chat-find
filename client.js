window.__ModuleLoader__.load({
  id: 'dsh-chat-find',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'conversation-find';

    /** Chat row kinds that count as "my messages and replies" (tool rows are excluded). */
    const SEARCH_KINDS = ['user', 'assistant-step', 'steering', 'question-reply'];

    /** Safety caps: a conversation is not an index, and a stuck loop must not freeze the UI. */
    const MAX_MATCHES = 500;
    const MAX_HISTORY_PAGES = 20;

    const HIGHLIGHT_ALL = 'conversation-find-all';
    const HIGHLIGHT_CURRENT = 'conversation-find-current';

    /**
     * Every locale the Chat view ships a "load earlier" label for, plus its
     * loading variant. Matching the visible label keeps this working without
     * depending on hashed CSS module class names.
     */
    const OLDER_LABELS = new Set([
      '加载更早',
      '加载中',
      'Load earlier',
      'Loading',
      '以前を読み込む',
      '読み込み中',
      'Cargar antes',
      'Cargando',
      'Charger plus tôt',
      'Chargement',
      'Früher laden',
      'Wird geladen',
      'Загрузить раньше',
      'Загрузка',
      'Carregar mais cedo',
      'Carregando',
    ]);

    const highlightApi =
      typeof CSS !== 'undefined' &&
      CSS.highlights !== undefined &&
      typeof Highlight === 'function';

    let t = (key) => key;

    // ---------------------------------------------------------------------
    // Shared state between the keyboard command and the rendered find bar.
    // ---------------------------------------------------------------------

    let state = {
      open: false,
      query: '',
      index: 0,
      total: 0,
      note: '',
      busy: false,
      hasOlder: false,
      focusToken: 0,
    };

    const listeners = new Set();

    function emit() {
      for (const listener of Array.from(listeners)) {
        try {
          listener();
        } catch {
          /* a single listener must not break the others */
        }
      }
    }

    function patch(next) {
      state = Object.assign({}, state, next);
      emit();
    }

    let ranges = [];

    // ---------------------------------------------------------------------
    // Search over the loaded Chat rows.
    // ---------------------------------------------------------------------

    function chatRoot() {
      return document.querySelector('[data-slot="conversation.chat.flow"]');
    }

    function collectRoots() {
      const root = chatRoot();
      if (root === null) return [];
      const rows = root.querySelectorAll('[data-chat-flow-kind]');
      const out = [];
      for (const row of rows) {
        const kind = row.getAttribute('data-chat-flow-kind');
        if (kind !== null && SEARCH_KINDS.indexOf(kind) !== -1) out.push(row);
      }
      return out;
    }

    function textNodesOf(root) {
      const nodes = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (node.nodeValue === null || node.nodeValue.trim() === '') {
            return NodeFilter.FILTER_REJECT;
          }
          const parent = node.parentElement;
          if (parent === null) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      for (;;) {
        const node = walker.nextNode();
        if (node === null) break;
        nodes.push(node);
      }
      return nodes;
    }

    function hasOlderControl() {
      return findOlderControl() !== null;
    }

    function findOlderControl() {
      const scope = document.querySelector('[data-conversation-scroll]') || document;
      const buttons = scope.querySelectorAll('button');
      for (const button of buttons) {
        const label = String(button.textContent || '').trim();
        if (OLDER_LABELS.has(label)) return button;
      }
      return null;
    }

    function paint() {
      if (!highlightApi) return;
      try {
        CSS.highlights.set(HIGHLIGHT_ALL, new Highlight(...ranges));
        const current = ranges[state.index];
        CSS.highlights.set(
          HIGHLIGHT_CURRENT,
          new Highlight(...(current === undefined ? [] : [current])),
        );
      } catch {
        /* Ranges can go stale while a turn streams in; the next search re-creates them. */
      }
    }

    function clearHighlights() {
      if (!highlightApi) return;
      try {
        CSS.highlights.delete(HIGHLIGHT_ALL);
        CSS.highlights.delete(HIGHLIGHT_CURRENT);
      } catch {
        /* nothing to clear */
      }
    }

    function runSearch(rawQuery) {
      const query = String(rawQuery === undefined || rawQuery === null ? '' : rawQuery).trim();
      ranges = [];

      if (query === '') {
        paint();
        patch({ index: 0, total: 0, note: t('empty'), hasOlder: hasOlderControl() });
        return;
      }

      const needle = query.toLowerCase();
      const roots = collectRoots();

      outer: for (const root of roots) {
        for (const node of textNodesOf(root)) {
          const value = node.nodeValue;
          if (value === null) continue;
          const haystack = value.toLowerCase();
          let from = 0;
          for (;;) {
            const at = haystack.indexOf(needle, from);
            if (at === -1) break;
            let range;
            try {
              range = document.createRange();
              range.setStart(node, at);
              range.setEnd(node, at + needle.length);
            } catch {
              break;
            }
            ranges.push(range);
            if (ranges.length >= MAX_MATCHES) break outer;
            from = at + needle.length;
          }
        }
      }

      const index = ranges.length === 0 ? 0 : Math.min(state.index, ranges.length - 1);
      paint();
      patch({
        index,
        total: ranges.length,
        note: ranges.length === 0 ? t('noResults') : '',
        hasOlder: hasOlderControl(),
      });
      if (ranges.length > 0) reveal(index);
    }

    function findScroller(node) {
      let element = node.parentElement;
      while (element !== null) {
        const style = window.getComputedStyle(element);
        const scrollable = /(auto|scroll|overlay)/.test(style.overflowY);
        if (scrollable && element.scrollHeight > element.clientHeight + 4) return element;
        element = element.parentElement;
      }
      return null;
    }

    /** Collapsed tool groups hide their body with hidden="until-found"; ask them to reveal. */
    function unfoldAround(node) {
      let element = node.parentElement;
      while (element !== null) {
        if (element.getAttribute && element.getAttribute('hidden') === 'until-found') {
          try {
            element.dispatchEvent(new Event('beforematch'));
          } catch {
            /* older Chromium builds may not expose the event */
          }
        }
        element = element.parentElement;
      }
    }

    function scrollRangeIntoView(range) {
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const scroller = findScroller(range.startContainer);
      if (scroller === null) {
        window.scrollBy({ top: rect.top - window.innerHeight / 2, behavior: 'smooth' });
        return true;
      }
      const box = scroller.getBoundingClientRect();
      const target =
        scroller.scrollTop + (rect.top - box.top) - box.height / 2 + rect.height / 2;
      scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
      return true;
    }

    function reveal(index) {
      const range = ranges[index];
      if (range === undefined) return;
      unfoldAround(range.startContainer);
      if (scrollRangeIntoView(range)) return;
      // The row may still be folded or mid-layout; retry once on the next frame.
      window.setTimeout(() => {
        const again = ranges[index];
        if (again !== undefined) scrollRangeIntoView(again);
      }, 120);
    }

    function step(delta) {
      if (ranges.length === 0) return;
      const index = (state.index + delta + ranges.length) % ranges.length;
      state = Object.assign({}, state, { index });
      paint();
      emit();
      reveal(index);
    }

    function close() {
      ranges = [];
      clearHighlights();
      patch({ open: false, query: '', index: 0, total: 0, note: '' });
    }

    function open() {
      patch({ open: true, focusToken: state.focusToken + 1 });
    }

    function wait(ms) {
      return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    async function loadEarlierHistory() {
      if (state.busy) return;
      patch({ busy: true, note: t('loadingHistory') });
      let pages = 0;
      while (pages < MAX_HISTORY_PAGES) {
        const button = findOlderControl();
        if (button === null) break;
        if (button.disabled) {
          await wait(200);
          const again = findOlderControl();
          if (again === null || again.disabled) break;
        }
        button.click();
        pages += 1;
        await wait(260);
      }
      await wait(250);
      patch({ busy: false });
      runSearch(state.query);
      if (pages > 0) patch({ note: t('historyLoaded') });
    }

    const CSS_TEXT = `
.cf-root{--cf-blur:26px;--cf-tint:54%;position:fixed;z-index:70;pointer-events:auto;-webkit-app-region:no-drag;app-region:no-drag;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;font-family:var(--ds-font-family,system-ui,-apple-system,"Segoe UI",sans-serif);font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#1f2329);animation:cf-pop .24s cubic-bezier(.2,.85,.25,1)}
@keyframes cf-pop{from{opacity:0;transform:translateX(-50%) translateY(-6px) scale(.97)}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}
.cf-bar{position:relative;isolation:isolate;display:flex;align-items:center;gap:4px;min-width:380px;max-width:min(560px,72vw);padding:6px 8px;border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.42),rgba(255,255,255,.06) 42%,transparent 64%),color-mix(in srgb,var(--dsw-alias-bg-layer-1,#fff) var(--cf-tint),transparent);-webkit-backdrop-filter:blur(var(--cf-blur)) saturate(190%) brightness(1.06);backdrop-filter:blur(var(--cf-blur)) saturate(190%) brightness(1.06);border:.5px solid color-mix(in srgb,var(--dsw-alias-label-primary,#000) 12%,transparent);box-shadow:inset 0 1px 0 rgba(255,255,255,.78),inset 0 2px 10px rgba(255,255,255,.25),inset 0 -10px 18px -16px rgba(0,0,0,.20),0 1px 2px rgba(0,0,0,.08),0 14px 36px -16px rgba(0,0,0,.22);transition:box-shadow .2s ease}
.cf-bar::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:0;opacity:.62;background:radial-gradient(150px 72px at var(--cf-mx,50%) var(--cf-my,0%),rgba(255,255,255,.5),transparent 72%),linear-gradient(180deg,rgba(255,255,255,.42),rgba(255,255,255,.06) 38%,transparent 60%),url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E");background-repeat:no-repeat,no-repeat,repeat}
.cf-bar::after{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;z-index:1;opacity:.85;background:linear-gradient(135deg,rgba(255,255,255,.92),rgba(160,200,255,.30) 16%,rgba(255,255,255,.06) 44%,rgba(255,190,225,.22) 76%,rgba(255,255,255,.82));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude}
.cf-glass,.cf-input,.cf-count,.cf-btn{position:relative;z-index:2}
.cf-glass{width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary,#5a6069);flex:none}
.cf-input{flex:1;min-width:0;height:30px;border:0;outline:0;background:transparent;color:inherit;font:inherit;padding:0 2px;caret-color:var(--dsw-alias-state-business-primary,#3b6fe0)}
.cf-input::placeholder{color:var(--dsw-alias-label-tertiary,#8a8f99)}
.cf-count{flex:none;color:var(--dsw-alias-label-tertiary,#8a8f99);font-variant-numeric:tabular-nums;padding:0 6px;white-space:nowrap}
.cf-btn{width:28px;height:28px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,#f0f0f0) 72%,transparent);color:var(--dsw-alias-label-secondary,#5a6069);cursor:pointer;font:inherit;padding:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.45);transition:background .15s ease,transform .12s ease,color .15s ease}
.cf-btn:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-bg-layer-2,#e8e9ec) 96%,transparent);color:var(--dsw-alias-label-primary,#1f2329)}
.cf-btn:active:not(:disabled){transform:scale(.9)}
.cf-btn:disabled{opacity:.38;cursor:default}
.cf-foot{display:flex;align-items:center;gap:10px;max-width:min(560px,72vw);padding:3px 10px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,#fff) 62%,transparent);-webkit-backdrop-filter:blur(14px) saturate(160%);backdrop-filter:blur(14px) saturate(160%);border:.5px solid color-mix(in srgb,var(--dsw-alias-label-primary,#000) 8%,transparent);box-shadow:0 4px 14px rgba(0,0,0,.10);color:var(--dsw-alias-label-tertiary,#8a8f99);font-size:12px;line-height:18px}
.cf-link{border:0;background:transparent;color:var(--dsw-alias-state-business-primary,#3b6fe0);cursor:pointer;font:inherit;padding:0}
.cf-link:disabled{color:var(--dsw-alias-label-tertiary,#8a8f99);cursor:default}
.cf-sep{opacity:.45}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.cf-bar,.cf-foot{background:var(--dsw-specific-input-major,#fff)}}
@media (prefers-reduced-motion:reduce){.cf-root{animation:none}.cf-btn{transition:none}}
::highlight(conversation-find-all){background-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#f5a524) 42%,transparent)}
::highlight(conversation-find-current){background-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b6fe0) 60%,transparent)}
`;

    /**
     * Place the bar over the top of the Conversation column, horizontally
     * centred. That keeps it clear of the window controls (minimise/maximise/
     * close) and of the Conversation header's own trailing actions.
     */
    function computeAnchor() {
      const width = typeof window === 'undefined' ? 1200 : window.innerWidth;
      const height = typeof window === 'undefined' ? 800 : window.innerHeight;
      const conversation = document.querySelector('[data-conversation-scroll]');
      if (conversation === null) {
        return { top: 64, left: Math.round(width / 2) };
      }
      const rect = conversation.getBoundingClientRect();
      const left = Math.round(rect.left + rect.width / 2);
      const top = Math.round(Math.max(56, Math.min(rect.top + 10, height / 3)));
      return { top, left };
    }

    function Glass() {
      return h(
        'svg',
        {
          width: 14,
          height: 14,
          viewBox: '0 0 16 16',
          fill: 'none',
          'aria-hidden': true,
        },
        h('circle', {
          cx: 7,
          cy: 7,
          r: 4.6,
          stroke: 'currentColor',
          strokeWidth: 1.4,
        }),
        h('path', {
          d: 'M10.4 10.4L14 14',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
        }),
      );
    }

    function FindBar() {
      const [snapshot, setSnapshot] = React.useState(state);
      const [anchor, setAnchor] = React.useState(computeAnchor);
      const inputRef = React.useRef(null);
      const barRef = React.useRef(null);
      const focusedRef = React.useRef(false);

      // Move the specular highlight with the pointer: the "wet" light that
      // slides across a glass surface is most of the liquid feel.
      const trackShine = (event) => {
        const bar = barRef.current;
        if (bar === null) return;
        const rect = bar.getBoundingClientRect();
        bar.style.setProperty('--cf-mx', event.clientX - rect.left + 'px');
        bar.style.setProperty('--cf-my', event.clientY - rect.top + 'px');
      };
      const resetShine = () => {
        const bar = barRef.current;
        if (bar === null) return;
        bar.style.setProperty('--cf-mx', '50%');
        bar.style.setProperty('--cf-my', '0%');
      };

      React.useEffect(() => {
        const listener = () => setSnapshot(state);
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }, []);

      React.useEffect(() => {
        if (!snapshot.open) return undefined;
        const update = () => setAnchor(computeAnchor());
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
      }, [snapshot.open]);

      // Esc must close the bar no matter where the focus is; the input-only
      // handler below cannot cover a click on the conversation behind it.
      React.useEffect(() => {
        if (!snapshot.open) return undefined;
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          close();
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
      }, [snapshot.open]);

      React.useEffect(() => {
        if (!snapshot.open) {
          focusedRef.current = false;
          return undefined;
        }
        const frame = window.requestAnimationFrame(() => {
          const input = inputRef.current;
          if (input === null) return;
          input.focus();
          input.select();
          focusedRef.current = true;
        });
        return () => window.cancelAnimationFrame(frame);
      }, [snapshot.open, snapshot.focusToken]);

      React.useEffect(() => {
        if (!snapshot.open) return undefined;
        const handle = window.setTimeout(() => runSearch(snapshot.query), 140);
        return () => window.clearTimeout(handle);
      }, [snapshot.query, snapshot.open]);

      React.useEffect(() => {
        return () => clearHighlights();
      }, []);

      if (!snapshot.open) return null;

      const hasMatches = snapshot.total > 0;
      const countText = hasMatches
        ? t('count')
            .replace('{index}', String(snapshot.index + 1))
            .replace('{total}', String(snapshot.total))
        : '';

      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          step(event.shiftKey ? -1 : 1);
        }
      };

      return h(
        'div',
        {
          className: 'cf-root',
          role: 'search',
          'aria-label': t('title'),
          style: { top: anchor.top + 'px', left: anchor.left + 'px' },
        },
        h('style', null, CSS_TEXT),
        h(
          'div',
          { className: 'cf-bar', ref: barRef, onPointerMove: trackShine, onPointerLeave: resetShine },
          h('span', { className: 'cf-glass' }, h(Glass)),
          h('input', {
            ref: inputRef,
            className: 'cf-input',
            type: 'text',
            value: snapshot.query,
            placeholder: t('placeholder'),
            'aria-label': t('placeholder'),
            spellCheck: false,
            autoComplete: 'off',
            onChange: (event) => patch({ query: event.target.value, index: 0 }),
            onKeyDown,
          }),
          h(
            'span',
            { className: 'cf-count', 'aria-live': 'polite' },
            countText,
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'cf-btn',
              title: t('previous'),
              'aria-label': t('previous'),
              disabled: !hasMatches,
              onClick: () => step(-1),
            },
            '↑',
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'cf-btn',
              title: t('next'),
              'aria-label': t('next'),
              disabled: !hasMatches,
              onClick: () => step(1),
            },
            '↓',
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'cf-btn',
              title: t('refresh'),
              'aria-label': t('refresh'),
              onClick: () => runSearch(snapshot.query),
            },
            '⟳',
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'cf-btn',
              title: t('close'),
              'aria-label': t('close'),
              onClick: close,
            },
            '✕',
          ),
        ),
        h(
          'div',
          { className: 'cf-foot' },
          snapshot.note !== '' ? h('span', null, snapshot.note) : null,
          snapshot.note !== '' && snapshot.hasOlder ? h('span', { className: 'cf-sep' }, '·') : null,
          snapshot.hasOlder
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'cf-link',
                  disabled: snapshot.busy,
                  onClick: loadEarlierHistory,
                },
                t('loadAll'),
              )
            : null,
          snapshot.note === '' && !snapshot.hasOlder ? h('span', null, t('scopeHint')) : null,
        ),
      );
    }

    // ---------------------------------------------------------------------
    // Plugin body
    // ---------------------------------------------------------------------

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        t = ctx.locale.bind(NS);

        ctx.effect(
          () =>
            ctx.locale.register(NS, {
              en: {
                'command.find': 'Find in conversation',
                title: 'Find in conversation',
                placeholder: 'Find in this conversation',
                close: 'Close',
                previous: 'Previous match',
                next: 'Next match',
                refresh: 'Search again',
                count: '{index}/{total}',
                noResults: 'No matches',
                empty: 'Type to find text',
                scopeHint: 'Searches your messages and replies',
                loadingHistory: 'Loading earlier history…',
                historyLoaded: 'Earlier history loaded',
                loadAll: 'Load earlier history',
              },
              zh: {
                'command.find': '在对话中查找',
                title: '在对话中查找',
                placeholder: '在当前对话中查找',
                close: '关闭',
                previous: '上一个',
                next: '下一个',
                refresh: '重新搜索',
                count: '{index}/{total}',
                noResults: '没有匹配项',
                empty: '输入关键词开始查找',
                scopeHint: '搜索你的消息与回复内容',
                loadingHistory: '正在加载更早的历史…',
                historyLoaded: '更早的历史已加载',
                loadAll: '加载更早的历史',
              },
            }),
          'conversation-find: dictionaries',
        );

        const isDesktopShell = typeof window !== 'undefined' && window.dshDesktop !== undefined;

        // Desktop: the native layer consumes registered chords before the page,
        // so a capture-phase listener covers the window before registration
        // completes. In a browser this branch stays off and Ctrl+F remains the
        // browser's own find bar.
        if (isDesktopShell) {
          ctx.effect(() => {
            const onKeyDown = (event) => {
              if (!(event.ctrlKey || event.metaKey)) return;
              if (event.altKey || event.shiftKey) return;
              if (event.key !== 'f' && event.key !== 'F') return;
              event.preventDefault();
              open();
            };
            window.addEventListener('keydown', onKeyDown, true);
            return () => window.removeEventListener('keydown', onKeyDown, true);
          }, 'conversation-find: ctrl+f listener');
        }

        // Editable command: it shows in Settings → Shortcuts and can be rebound.
        ctx.inject(['shortcuts'], (scope) => {
          scope.effect(
            () =>
              scope.shortcuts.register({
                id: 'conversation.find',
                label: () => t('command.find'),
                aliases: ['find', 'search conversation'],
                defaults: {
                  'desktop:windows': { code: 'KeyF', modifiers: ['primary'] },
                  'desktop:macos': { code: 'KeyF', modifiers: ['primary'] },
                  'desktop:linux': { code: 'KeyF', modifiers: ['primary'] },
                },
                regions: ['page', 'editable'],
                modals: [],
                resolve: () => ({
                  status: 'handled',
                  run: open,
                }),
              }),
            'conversation-find: shortcut',
          );
        });

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'conversation-find',
              order: 30,
              label: () => t('command.find'),
            },
            FindBar,
          ),
        );
      },
    };
  },
});
