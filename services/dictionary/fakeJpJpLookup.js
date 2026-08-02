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
