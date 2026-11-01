import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { EditorState } from '@codemirror/state';

const result = await build({
  entryPoints: ['src/views/note-link-view-plugin.ts'],
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['@codemirror/state', '@codemirror/view'],
  plugins: [{
    name: 'obsidian-test-stub',
    setup(build) {
      build.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'stub' }));
      build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: `
        export const editorInfoField = 'info';
        export const editorLivePreviewField = 'live';
        export const getIcon = () => null;
      ` }));
    },
  }],
});
const module = { exports: {} };
vm.runInNewContext(result.outputFiles[0].text, {
  module, exports: module.exports, require: createRequire(import.meta.url),
  DOMParser: class {},
});
const { buildNoteLinkViewPlugin } = module.exports;

function decorations(live, cursor = 0) {
  const state = EditorState.create({ doc: 'Text [[Example]] and [[Example|Alias]].', selection: { anchor: cursor } });
  const plugin = buildNoteLinkViewPlugin({
    styledNoteBasenames: new Set(['Example']),
    previewNoteBasenames: new Set(), statusNoteMap: new Map(),
    noteLinkStyle: () => ({ color: '#123456', icon: 'book-open' }),
  });
  const instance = plugin.create({
    state: {
      doc: state.doc, selection: state.selection,
      field: (field) => field === 'live' ? live : undefined,
    },
    dom: { querySelectorAll: () => [] },
  });
  const ranges = [];
  for (let cursor = instance.decorations.iter(); cursor.value; cursor.next()) {
    ranges.push({ from: cursor.from, to: cursor.to, spec: cursor.value.spec });
  }
  return ranges;
}

test('source mode renders one icon widget per link, not per syntax fragment', () => {
  const ranges = decorations(false);
  const widgets = ranges.filter((range) => range.spec.widget);
  assert.deepEqual(widgets.map(({ from, to }) => [from, to]), [[5, 5], [21, 21]]);
  for (const range of ranges.filter((range) => !range.spec.widget)) {
    assert.ok(!range.spec.attributes.style.includes('--ffc-note-link-icon'));
    assert.ok(range.spec.class.includes('ffc-note-link-editing'));
  }
});

test('live preview does not add source-mode widgets', () => {
  assert.ok(decorations(true).every((range) => !range.spec.widget));
});

test('editing a source link hides its icon without affecting other links', () => {
  const widgets = decorations(false, 8).filter((range) => range.spec.widget);
  assert.deepEqual(widgets.map((range) => range.from), [21]);
});
