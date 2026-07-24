// services/dictionary/fakeJpJpLookup.js
//
// TEMPORARY, like fakeJpEnLookup.js — deleted once a real JP-JP
// (monolingual) dictionary source is picked and normalized. No source
// chosen yet, unlike KANJIDIC2/Jitendex which are real, named projects.
//
// Named fakeJpJpLookup (not fakeLookup) on purpose: this file shares a
// global scope with fakeJpEnLookup.js (no bundler, no modules — see
// content/mode.js's header comment) — two files both declaring
// `function fakeLookup` would silently overwrite one, not throw an
// error, which is the kind of bug that's easy to miss until it's live.
//
// Definitions below are hand-written by me for demo purposes, not
// copied from any dictionary. A couple of them deliberately reference
// each other (学生's definition contains the substring 学生 itself, via
// 大学生/高校生) so dragging a selection across text INSIDE the card —
// "deep search" — has something real to land on, not just the generic
// fallback every time.

const DEMO_JP_JP_ENTRIES = {
  '食べる': {
    reading: 'たべる',
    definition: '口に入れて、かんでのみこむこと。ごはんやくだものを食べる。',
  },
  '大きい': {
    reading: 'おおきい',
    definition: 'サイズや量がふつうより多いこと。小さいの反対。',
  },
  '猫': {
    reading: 'ねこ',
    definition: '小さくてかわいい動物。ペットとして人気がある。犬と同じくらいよく飼われている。',
  },
  '学生': {
    reading: 'がくせい',
    definition: '学校で勉強している人。大学生や高校生も学生と呼ぶ。',
  },
};

function fakeJpJpLookup(text) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (text === 'error') {
        reject({ code: 'demo_error', message: 'Simulated lookup failure.' });
        return;
      }
      const known = DEMO_JP_JP_ENTRIES[text];
      resolve({
        originalText: text,
        reading: known ? known.reading : undefined,
        definition: known ? known.definition : `（デモデータ — 「${text}」はまだサンプルにありません）`,
        isDemoData: true,
      });
    }, 350);
  });
}
