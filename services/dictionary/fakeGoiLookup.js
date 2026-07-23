// services/dictionary/fakeGoiLookup.js
//
// TEMPORARY. This whole file gets deleted once Jitendex is normalized
// and wired up — it'll be replaced by
// services/dictionary/providers/JitendexProvider.js implementing the
// DictionaryProvider interface from the architecture docs, called
// through a real DictionaryService/ProviderRegistry, not called
// directly like this.
//
// Until then: a handful of real entries so the UI has something to
// show, plus a generic fallback so ANY selection demonstrates the full
// card, and the literal word "error" to demonstrate the error state.

const DEMO_ENTRIES = {
  '食べる': {
    reading: 'たべる',
    wordType: { label: 'Ichidan verb', conjugationClass: 'ichidan' },
    jlptLevel: 'N5',
    meanings: ['to eat'],
    exampleSentences: [{ japanese: '朝ごはんを食べる。', translation: 'I eat breakfast.' }],
  },
  '大きい': {
    reading: 'おおきい',
    wordType: { label: 'i-adjective', conjugationClass: 'i-adjective' },
    jlptLevel: 'N5',
    meanings: ['big', 'large'],
    exampleSentences: [{ japanese: '大きい犬ですね。', translation: "That's a big dog." }],
  },
  '猫': {
    reading: 'ねこ',
    wordType: { label: 'Noun', conjugationClass: 'noun' },
    jlptLevel: 'N5',
    meanings: ['cat'],
    exampleSentences: [{ japanese: '猫が好きです。', translation: 'I like cats.' }],
  },
  '学生': {
    reading: 'がくせい',
    wordType: { label: 'Noun', conjugationClass: 'noun' },
    jlptLevel: 'N5',
    meanings: ['student'],
    exampleSentences: [{ japanese: '彼は学生です。', translation: 'He is a student.' }],
  },
};

/** Stand-in for services/dictionary/DictionaryService.lookup() (Goi mode). */
function fakeLookup(text) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (text === 'error') {
        reject({ code: 'demo_error', message: 'Simulated lookup failure.' });
        return;
      }
      const known = DEMO_ENTRIES[text];
      resolve({
        originalText: text,
        reading: known ? known.reading : undefined,
        wordType: known ? known.wordType : undefined,
        jlptLevel: known ? known.jlptLevel : undefined,
        meanings: known ? known.meanings : [`(demo data — "${text}" isn't in the sample set yet)`],
        exampleSentences: known ? known.exampleSentences : [],
        isDemoData: true,
      });
    }, 350);
  });
}
